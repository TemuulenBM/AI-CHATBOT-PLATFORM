import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios before imports
const mockAxiosGet = vi.fn();
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: mockAxiosGet,
    })),
  },
}));

// Mock robots-parser
vi.mock("robots-parser", () => ({
  default: vi.fn(() => ({
    isAllowed: vi.fn().mockReturnValue(true),
  })),
}));

// Mock xml2js
vi.mock("xml2js", () => ({
  parseStringPromise: vi.fn().mockResolvedValue({}),
}));

// Mock logger
vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { WebsiteScraper, scrapeWebsite } from "../../../server/services/scraper";

describe("Website Scraper - Direct Import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("WebsiteScraper constructor", () => {
    it("should create instance with default options", () => {
      const scraper = new WebsiteScraper();
      expect(scraper).toBeDefined();
    });

    it("should create instance with custom options", () => {
      const scraper = new WebsiteScraper({
        maxPages: 100,
        concurrency: 5,
        timeout: 60000,
      });
      expect(scraper).toBeDefined();
    });
  });

  describe("scrapeWebsite", () => {
    it("should scrape website and return pages", async () => {
      const scraper = new WebsiteScraper({ maxPages: 2, concurrency: 1 });

      // Mock robots.txt
      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt")) {
          return Promise.resolve({ data: "User-agent: *\nAllow: /" });
        }
        if (url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        // Main page
        return Promise.resolve({
          data: `
            <html>
              <head><title>Test Page</title></head>
              <body>
                <main>
                  This is test content that should be extracted. It has enough characters to pass the minimum length check.
                </main>
                <a href="/page2">Link to page 2</a>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 1);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
    });

    it("should limit pages to maxPages", async () => {
      const scraper = new WebsiteScraper({ maxPages: 1, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          data: `
            <html>
              <head><title>Test Page</title></head>
              <body>
                <main>
                  This is sufficient content for the scraper to extract and use for embeddings.
                </main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 1);

      expect(pages.length).toBeLessThanOrEqual(1);
    });

    it("should skip pages with insufficient content", async () => {
      const scraper = new WebsiteScraper({ maxPages: 1, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          data: `
            <html>
              <head><title>Test</title></head>
              <body>Short</body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 1);

      expect(pages.length).toBe(0);
    });

    it("should handle scraping errors gracefully", async () => {
      const scraper = new WebsiteScraper({ maxPages: 1, concurrency: 1 });

      mockAxiosGet.mockRejectedValue(new Error("Network error"));

      const pages = await scraper.scrapeWebsite("https://example.com", 1);

      expect(pages.length).toBe(0);
    });

    it("should extract content from article element", async () => {
      const scraper = new WebsiteScraper({ maxPages: 1, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          data: `
            <html>
              <head><title>Article Page</title></head>
              <body>
                <nav>Navigation here</nav>
                <article>
                  This is the main article content that should be extracted for the chatbot.
                </article>
                <footer>Footer here</footer>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 1);

      expect(pages.length).toBe(1);
      expect(pages[0].title).toBe("Article Page");
    });

    it("should remove unwanted elements", async () => {
      const scraper = new WebsiteScraper({ maxPages: 1, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          data: `
            <html>
              <head><title>Page with Scripts</title></head>
              <body>
                <main>
                  <script>alert('should be removed');</script>
                  <style>.hidden { display: none; }</style>
                  This is the main content that should be extracted without scripts.
                </main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 1);

      expect(pages.length).toBe(1);
      expect(pages[0].content).not.toContain("alert");
    });
  });

  describe("scrapeWebsite factory function", () => {
    it("should create scraper and scrape website", async () => {
      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          data: `
            <html>
              <head><title>Factory Test</title></head>
              <body>
                <main>
                  Content from factory function test with sufficient length for processing.
                </main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scrapeWebsite("https://example.com", 1);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
    });
  });

  describe("URL resolution", () => {
    it("should handle relative URLs", async () => {
      const scraper = new WebsiteScraper({ maxPages: 2, concurrency: 1 });

      let callCount = 0;
      mockAxiosGet.mockImplementation((url: string) => {
        callCount++;
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        if (callCount <= 2) {
          // First call for crawling links
          return Promise.resolve({
            data: `
              <html>
                <body>
                  <main>Main content here with enough characters to pass validation.</main>
                  <a href="/about">About</a>
                  <a href="/contact">Contact</a>
                </body>
              </html>
            `,
          });
        }
        return Promise.resolve({
          data: `
            <html>
              <body>
                <main>Another page with sufficient content for extraction.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 2);

      expect(pages).toBeDefined();
    });

    it("should skip external URLs", async () => {
      const scraper = new WebsiteScraper({ maxPages: 2, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          data: `
            <html>
              <body>
                <main>Main content with sufficient length for extraction.</main>
                <a href="https://external.com/page">External Link</a>
                <a href="/internal">Internal Link</a>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 5);

      // Should not include external URLs
      expect(pages.every((p) => p.url.startsWith("https://example.com"))).toBe(true);
    });

    it("should skip non-page URLs like images and PDFs", async () => {
      const scraper = new WebsiteScraper({ maxPages: 5, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          data: `
            <html>
              <body>
                <main>Main content with enough characters for processing.</main>
                <a href="/image.jpg">Image</a>
                <a href="/document.pdf">PDF</a>
                <a href="/script.js">JS</a>
                <a href="/page">Valid Page</a>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 5);

      // Should not include image, PDF, or JS URLs
      expect(pages.every((p) => !p.url.match(/\.(jpg|pdf|js)$/))).toBe(true);
    });
  });

  describe("robots.txt handling", () => {
    it("should respect robots.txt rules", async () => {
      const scraper = new WebsiteScraper({ maxPages: 1, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt")) {
          return Promise.resolve({
            data: "User-agent: *\nDisallow: /private/",
          });
        }
        if (url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          data: `
            <html>
              <body>
                <main>Public content with enough text for extraction.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 1);

      expect(pages).toBeDefined();
    });
  });

  describe("sitemap parsing", () => {
    it("should parse sitemap.xml", async () => {
      const scraper = new WebsiteScraper({ maxPages: 2, concurrency: 1 });

      const { parseStringPromise } = await import("xml2js");
      (parseStringPromise as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        urlset: {
          url: [
            { loc: ["https://example.com/page1"] },
            { loc: ["https://example.com/page2"] },
          ],
        },
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt")) {
          return Promise.reject(new Error("Not found"));
        }
        if (url.includes("sitemap")) {
          return Promise.resolve({
            data: "<urlset></urlset>",
          });
        }
        return Promise.resolve({
          data: `
            <html>
              <body>
                <main>Sitemap page content with sufficient length.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 2);

      expect(pages).toBeDefined();
    });
  });

  describe("content extraction", () => {
    it("should fallback to body when no main content found", async () => {
      const scraper = new WebsiteScraper({ maxPages: 1, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          data: `
            <html>
              <body>
                <div>Body content without main element that is long enough.</div>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 1);

      expect(pages.length).toBe(1);
      expect(pages[0].content).toContain("Body content");
    });

    it("should use h1 as title fallback", async () => {
      const scraper = new WebsiteScraper({ maxPages: 1, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          data: `
            <html>
              <head></head>
              <body>
                <main>
                  <h1>H1 Title</h1>
                  <p>Content paragraph with sufficient length for processing.</p>
                </main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 1);

      expect(pages.length).toBe(1);
      expect(pages[0].title).toBe("H1 Title");
    });
  });
});
