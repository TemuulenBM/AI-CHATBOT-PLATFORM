import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { parseStringPromise } from "xml2js";
import logger from "../utils/logger";

interface ScrapedPage {
  url: string;
  title: string;
  content: string;
}

interface ScraperOptions {
  maxPages: number;
  concurrency: number;
  timeout: number;
  userAgent: string;
  filterLoginPages?: boolean;
  filterErrorPages?: boolean;
  customFilterPatterns?: string[];
}

const DEFAULT_OPTIONS: ScraperOptions = {
  maxPages: 50,
  concurrency: 3,
  timeout: 30000,
  userAgent: "ChatbotScraper/1.0 (+https://example.com/bot)",
  filterLoginPages: true,
  filterErrorPages: true,
};

export class WebsiteScraper {
  private options: ScraperOptions;
  private client: AxiosInstance;
  private visitedUrls: Set<string>;
  private robotsRules: ReturnType<typeof robotsParser> | null;
  private baseUrl: string;
  private filteredCount: { status: number; url: number; content: number };

  constructor(options: Partial<ScraperOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.visitedUrls = new Set();
    this.robotsRules = null;
    this.baseUrl = "";
    this.filteredCount = { status: 0, url: 0, content: 0 };

    this.client = axios.create({
      timeout: this.options.timeout,
      headers: {
        "User-Agent": this.options.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      maxRedirects: 5,
    });
  }

  async scrapeWebsite(url: string, maxPages?: number): Promise<ScrapedPage[]> {
    const limit = maxPages || this.options.maxPages;
    this.baseUrl = new URL(url).origin;
    this.visitedUrls.clear();
    this.filteredCount = { status: 0, url: 0, content: 0 };

    logger.info("Starting website scrape", { url, maxPages: limit });

    // Fetch and parse robots.txt
    await this.fetchRobotsTxt();

    // Get URLs from sitemap or start with base URL
    const urls = await this.getUrlsToScrape(url);
    const limitedUrls = urls.slice(0, limit);

    logger.info("Found URLs to scrape", { count: limitedUrls.length });

    // Scrape with concurrency control
    const results: ScrapedPage[] = [];
    const chunks = this.chunkArray(limitedUrls, this.options.concurrency);

    for (const chunk of chunks) {
      if (results.length >= limit) break;

      const chunkResults = await Promise.allSettled(
        chunk.map((pageUrl) => this.scrapePage(pageUrl))
      );

      for (const result of chunkResults) {
        if (result.status === "fulfilled" && result.value) {
          results.push(result.value);
          if (results.length >= limit) break;
        }
      }

      // Rate limiting delay between batches
      await this.delay(1000);
    }

    logger.info("Scraping completed", {
      pagesScraped: results.length,
      filteredByStatus: this.filteredCount.status,
      filteredByUrl: this.filteredCount.url,
      filteredByContent: this.filteredCount.content,
      totalFiltered:
        this.filteredCount.status +
        this.filteredCount.url +
        this.filteredCount.content,
    });
    return results;
  }

  private async fetchRobotsTxt(): Promise<void> {
    try {
      const robotsUrl = `${this.baseUrl}/robots.txt`;
      const response = await this.client.get(robotsUrl);
      this.robotsRules = robotsParser(robotsUrl, response.data);
      logger.debug("Robots.txt fetched", { url: robotsUrl });
    } catch {
      logger.debug("No robots.txt found or inaccessible");
      this.robotsRules = null;
    }
  }

  private async getUrlsToScrape(startUrl: string): Promise<string[]> {
    const urls: Set<string> = new Set();

    // Filter start URL if needed
    if (!this.isUselessUrl(startUrl)) {
      urls.add(startUrl);
    } else {
      logger.debug("Start URL filtered by pattern", {
        url: startUrl,
        reason: "url_pattern",
      });
    }

    // Try to get sitemap
    const sitemapUrls = await this.fetchSitemap();
    sitemapUrls.forEach((url) => {
      if (!this.isUselessUrl(url)) {
        urls.add(url);
      }
    });

    // If sitemap didn't provide enough URLs, crawl from start page
    if (urls.size < this.options.maxPages) {
      const crawledUrls = await this.crawlForLinks(startUrl);
      crawledUrls.forEach((url) => {
        if (!this.isUselessUrl(url)) {
          urls.add(url);
        }
      });
    }

    return Array.from(urls);
  }

  private async fetchSitemap(): Promise<string[]> {
    const urls: string[] = [];
    const sitemapUrls = [
      `${this.baseUrl}/sitemap.xml`,
      `${this.baseUrl}/sitemap_index.xml`,
    ];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await this.client.get(sitemapUrl);
        const parsed = await parseStringPromise(response.data);

        // Handle sitemap index
        if (parsed.sitemapindex?.sitemap) {
          for (const sitemap of parsed.sitemapindex.sitemap) {
            const nestedUrls = await this.fetchSitemapFromUrl(sitemap.loc[0]);
            urls.push(...nestedUrls);
          }
        }

        // Handle regular sitemap
        if (parsed.urlset?.url) {
          for (const urlEntry of parsed.urlset.url) {
            if (urlEntry.loc?.[0]) {
              const url = urlEntry.loc[0];
              // Filter by robots.txt and useless URL patterns
              if (this.isAllowedUrl(url) && !this.isUselessUrl(url)) {
                urls.push(url);
              }
            }
          }
        }

        if (urls.length > 0) {
          logger.debug("Sitemap parsed", { urlCount: urls.length });
          break;
        }
      } catch {
        // Sitemap not available, continue
      }
    }

    return urls;
  }

  private async fetchSitemapFromUrl(sitemapUrl: string): Promise<string[]> {
    const urls: string[] = [];
    try {
      const response = await this.client.get(sitemapUrl);
      const parsed = await parseStringPromise(response.data);

      if (parsed.urlset?.url) {
        for (const urlEntry of parsed.urlset.url) {
          if (urlEntry.loc?.[0]) {
            const url = urlEntry.loc[0];
            // Filter by robots.txt and useless URL patterns
            if (this.isAllowedUrl(url) && !this.isUselessUrl(url)) {
              urls.push(url);
            }
          }
        }
      }
    } catch {
      // Nested sitemap not available
    }
    return urls;
  }

  private async crawlForLinks(startUrl: string): Promise<string[]> {
    const urls: Set<string> = new Set();

    try {
      const response = await this.client.get(startUrl);
      const $ = cheerio.load(response.data);

      $("a[href]").each((_, element) => {
        const href = $(element).attr("href");
        if (href) {
          const absoluteUrl = this.resolveUrl(href);
          if (
            absoluteUrl &&
            this.isAllowedUrl(absoluteUrl) &&
            !this.isUselessUrl(absoluteUrl)
          ) {
            urls.add(absoluteUrl);
          }
        }
      });
    } catch (error) {
      logger.debug("Failed to crawl for links", { url: startUrl, error });
    }

    return Array.from(urls);
  }

  private async scrapePage(url: string): Promise<ScrapedPage | null> {
    if (this.visitedUrls.has(url)) {
      return null;
    }

    if (!this.isAllowedUrl(url)) {
      logger.debug("URL blocked by robots.txt", { url });
      return null;
    }

    // Filter by URL patterns early (before making HTTP request)
    if (this.isUselessUrl(url)) {
      this.filteredCount.url++;
      logger.debug("URL filtered by pattern", { url, reason: "url_pattern" });
      return null;
    }

    this.visitedUrls.add(url);

    try {
      const response = await this.client.get(url);

      // Check HTTP status code
      const status = response.status;
      if (status !== 200 && status !== 201) {
        this.filteredCount.status++;
        logger.debug("Page filtered by HTTP status", {
          url,
          status,
          reason: "http_status",
        });
        return null;
      }

      const $ = cheerio.load(response.data);

      // Remove unwanted elements
      $(
        "script, style, nav, header, footer, iframe, noscript, svg, " +
          ".navigation, .sidebar, .menu, .cookie-banner, .ad, .advertisement"
      ).remove();

      // Extract title
      const title =
        $("title").text().trim() ||
        $("h1").first().text().trim() ||
        url;

      // Content-based filtering: Check for login pages
      if (this.isLoginPage($, title)) {
        this.filteredCount.content++;
        logger.debug("Page filtered as login page", {
          url,
          title,
          reason: "login_page",
        });
        return null;
      }

      // Content-based filtering: Check for error pages
      if (this.isErrorPage($, title)) {
        this.filteredCount.content++;
        logger.debug("Page filtered as error page", {
          url,
          title,
          reason: "error_page",
        });
        return null;
      }

      // Extract main content
      const content = this.extractContent($);

      if (!content || content.length < 50) {
        logger.debug("Skipping page with insufficient content", { url });
        return null;
      }

      logger.debug("Page scraped successfully", {
        url,
        contentLength: content.length,
      });

      return { url, title, content };
    } catch (error) {
      // Check if it's an HTTP error with status code
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        if (status === 404 || status === 401 || status === 403 || status >= 500) {
          this.filteredCount.status++;
          logger.debug("Page filtered by HTTP error status", {
            url,
            status,
            reason: "http_error",
          });
          return null;
        }
      }

      logger.debug("Failed to scrape page", { url, error });
      return null;
    }
  }

  private extractContent($: cheerio.CheerioAPI): string {
    // Try to find main content area
    const mainSelectors = [
      "main",
      "article",
      '[role="main"]',
      ".content",
      ".main-content",
      "#content",
      "#main",
    ];

    let content = "";

    for (const selector of mainSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }

    // Fallback to body
    if (!content) {
      content = $("body").text();
    }

    // Clean up content
    return content
      .replace(/\s+/g, " ")
      .replace(/\n+/g, "\n")
      .trim();
  }

  private resolveUrl(href: string): string | null {
    try {
      const resolved = new URL(href, this.baseUrl);

      // Only allow same-origin URLs
      if (resolved.origin !== this.baseUrl) {
        return null;
      }

      // Skip non-page URLs
      const skipExtensions = [
        ".pdf",
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".svg",
        ".css",
        ".js",
        ".xml",
        ".json",
        ".zip",
        ".mp3",
        ".mp4",
        ".avi",
      ];

      if (skipExtensions.some((ext) => resolved.pathname.endsWith(ext))) {
        return null;
      }

      // Skip fragments and query params
      resolved.hash = "";
      resolved.search = "";

      return resolved.toString();
    } catch {
      return null;
    }
  }

  private isAllowedUrl(url: string): boolean {
    if (!this.robotsRules) {
      return true;
    }

    return this.robotsRules.isAllowed(url, this.options.userAgent) !== false;
  }

  /**
   * Check if URL matches patterns for login/auth/error pages
   */
  private isUselessUrl(url: string): boolean {
    if (!this.options.filterLoginPages && !this.options.filterErrorPages) {
      return false;
    }

    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();

      // Common login/auth patterns
      if (this.options.filterLoginPages) {
        const loginPatterns = [
          /\/login/i,
          /\/signin/i,
          /\/sign-in/i,
          /\/auth/i,
          /\/authentication/i,
          /\/logout/i,
          /\/signout/i,
          /\/sign-out/i,
          /\/register/i,
          /\/signup/i,
          /\/sign-up/i,
          /\/forgot-password/i,
          /\/reset-password/i,
          /\/password-reset/i,
          /\/password\/reset/i,
          /\/admin\/login/i,
          /\/wp-admin/i,
          /\/wp-login/i,
        ];

        if (loginPatterns.some((pattern) => pattern.test(pathname))) {
          return true;
        }
      }

      // Common error page patterns
      if (this.options.filterErrorPages) {
        const errorPatterns = [
          /\/404/i,
          /\/error/i,
          /\/not-found/i,
          /\/500/i,
          /\/503/i,
          /\/unauthorized/i,
          /\/forbidden/i,
        ];

        if (errorPatterns.some((pattern) => pattern.test(pathname))) {
          return true;
        }
      }

      // Check custom filter patterns
      if (this.options.customFilterPatterns && this.options.customFilterPatterns.length > 0) {
        for (const pattern of this.options.customFilterPatterns) {
          try {
            const regex = new RegExp(pattern, "i");
            if (regex.test(pathname) || regex.test(url)) {
              return true;
            }
          } catch {
            // Invalid regex pattern, skip
          }
        }
      }

      return false;
    } catch {
      // Invalid URL, allow it to be processed (will fail later)
      return false;
    }
  }

  /**
   * Detect if page content indicates a login page
   */
  private isLoginPage($: cheerio.CheerioAPI, title: string): boolean {
    if (!this.options.filterLoginPages) {
      return false;
    }

    const titleLower = title.toLowerCase();

    // Check title for login indicators
    const loginTitlePatterns = [
      "login",
      "sign in",
      "sign-in",
      "sign up",
      "sign-up",
      "register",
      "authentication",
      "log in",
    ];

    if (loginTitlePatterns.some((pattern) => titleLower.includes(pattern))) {
      return true;
    }

    // Check for password input fields (strong indicator of login page)
    const passwordInputs = $('input[type="password"]');
    if (passwordInputs.length > 0) {
      // Check if it's likely a login form vs contact form
      const form = passwordInputs.closest("form");
      if (form.length > 0) {
        const formText = form.text().toLowerCase();
        // If form contains login-related text, it's likely a login page
        if (
          formText.includes("login") ||
          formText.includes("sign in") ||
          formText.includes("email") ||
          formText.includes("username")
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Detect if page content indicates an error page
   */
  private isErrorPage($: cheerio.CheerioAPI, title: string): boolean {
    if (!this.options.filterErrorPages) {
      return false;
    }

    const titleLower = title.toLowerCase();
    const bodyText = $("body").text().toLowerCase();

    // Check title for error indicators
    const errorTitlePatterns = [
      "404",
      "not found",
      "page not found",
      "error",
      "unauthorized",
      "forbidden",
      "server error",
      "500",
      "503",
    ];

    if (errorTitlePatterns.some((pattern) => titleLower.includes(pattern))) {
      return true;
    }

    // Check body content for common error messages
    const errorContentPatterns = [
      "404",
      "not found",
      "page not found",
      "error occurred",
      "something went wrong",
      "unauthorized access",
      "access denied",
      "forbidden",
      "internal server error",
    ];

    if (errorContentPatterns.some((pattern) => bodyText.includes(pattern))) {
      // Additional check: if page has very little content, it's likely an error page
      const contentLength = bodyText.trim().length;
      if (contentLength < 200) {
        return true;
      }
    }

    return false;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Factory function
export async function scrapeWebsite(
  url: string,
  maxPages: number = 50
): Promise<ScrapedPage[]> {
  const scraper = new WebsiteScraper({ maxPages, concurrency: 3 });
  return scraper.scrapeWebsite(url, maxPages);
}
