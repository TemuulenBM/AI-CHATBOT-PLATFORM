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
}

const DEFAULT_OPTIONS: ScraperOptions = {
  maxPages: 50,
  concurrency: 3,
  timeout: 30000,
  userAgent: "ChatbotScraper/1.0 (+https://example.com/bot)",
};

export class WebsiteScraper {
  private options: ScraperOptions;
  private client: AxiosInstance;
  private visitedUrls: Set<string>;
  private robotsRules: ReturnType<typeof robotsParser> | null;
  private baseUrl: string;

  constructor(options: Partial<ScraperOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.visitedUrls = new Set();
    this.robotsRules = null;
    this.baseUrl = "";

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

    logger.info("Scraping completed", { pagesScraped: results.length });
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
    const urls: Set<string> = new Set([startUrl]);

    // Try to get sitemap
    const sitemapUrls = await this.fetchSitemap();
    sitemapUrls.forEach((url) => urls.add(url));

    // If sitemap didn't provide enough URLs, crawl from start page
    if (urls.size < this.options.maxPages) {
      const crawledUrls = await this.crawlForLinks(startUrl);
      crawledUrls.forEach((url) => urls.add(url));
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
              urls.push(urlEntry.loc[0]);
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

    return urls.filter((url) => this.isAllowedUrl(url));
  }

  private async fetchSitemapFromUrl(sitemapUrl: string): Promise<string[]> {
    const urls: string[] = [];
    try {
      const response = await this.client.get(sitemapUrl);
      const parsed = await parseStringPromise(response.data);

      if (parsed.urlset?.url) {
        for (const urlEntry of parsed.urlset.url) {
          if (urlEntry.loc?.[0]) {
            urls.push(urlEntry.loc[0]);
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
          if (absoluteUrl && this.isAllowedUrl(absoluteUrl)) {
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

    this.visitedUrls.add(url);

    try {
      const response = await this.client.get(url);
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
