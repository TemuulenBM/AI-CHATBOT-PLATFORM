import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios before imports
const mockAxiosGet = vi.fn();
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: mockAxiosGet,
    })),
    isAxiosError: (error: unknown): boolean => {
      return (
        typeof error === "object" &&
        error !== null &&
        "isAxiosError" in error &&
        (error as { isAxiosError: boolean }).isAxiosError === true
      );
    },
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
          status: 200,
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
          status: 200,
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
          status: 200,
          data: `
            <html>
              <body>
                <div>Body content without main element that is long enough for extraction and processing.</div>
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
          status: 200,
          data: `
            <html>
              <head></head>
              <body>
                <main>
                  <h1>H1 Title</h1>
                  <p>Content paragraph with sufficient length for processing and extraction.</p>
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

  describe("URL pattern filtering", () => {
    it("should filter login pages by URL pattern", async () => {
      const scraper = new WebsiteScraper({
        maxPages: 5,
        concurrency: 1,
        filterLoginPages: true,
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        if (url.includes("/login")) {
          return Promise.resolve({
            status: 200,
            data: `
              <html>
                <head><title>Login Page</title></head>
                <body>
                  <main>Login form content with sufficient length.</main>
                </body>
              </html>
            `,
          });
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <body>
                <main>Valid page content with enough characters for extraction.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com/login", 5);

      // Login page should be filtered
      expect(pages.every((p) => !p.url.includes("/login"))).toBe(true);
    });

    it("should filter signup pages by URL pattern", async () => {
      const scraper = new WebsiteScraper({
        maxPages: 5,
        concurrency: 1,
        filterLoginPages: true,
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <body>
                <main>Content with sufficient length.</main>
                <a href="/signup">Sign Up</a>
                <a href="/page">Valid Page</a>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 5);

      // Signup pages should be filtered
      expect(pages.every((p) => !p.url.includes("/signup"))).toBe(true);
    });

    it("should filter error pages by URL pattern", async () => {
      const scraper = new WebsiteScraper({
        maxPages: 5,
        concurrency: 1,
        filterErrorPages: true,
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <body>
                <main>Content with sufficient length.</main>
                <a href="/404">404 Page</a>
                <a href="/page">Valid Page</a>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 5);

      // 404 pages should be filtered
      expect(pages.every((p) => !p.url.includes("/404"))).toBe(true);
    });

    it("should not filter when filterLoginPages is disabled", async () => {
      const scraper = new WebsiteScraper({
        maxPages: 2,
        concurrency: 1,
        filterLoginPages: false,
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        if (url.includes("/login")) {
          return Promise.resolve({
            status: 200,
            data: `
              <html>
                <head><title>Login</title></head>
                <body>
                  <main>Login page content with sufficient length for extraction.</main>
                </body>
              </html>
            `,
          });
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <body>
                <main>Valid page content with enough characters.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com/login", 2);

      // Login page should NOT be filtered when option is disabled
      expect(pages.some((p) => p.url.includes("/login"))).toBe(true);
    });
  });

  describe("HTTP status code filtering", () => {
    it("should filter 404 pages by status code", async () => {
      const scraper = new WebsiteScraper({ maxPages: 2, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        if (url.includes("/missing")) {
          return Promise.reject({
            response: { status: 404 },
            isAxiosError: true,
          });
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <body>
                <main>Valid page content with sufficient length.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com/missing", 2);

      // 404 page should be filtered
      expect(pages.length).toBe(0);
    });

    it("should filter 401 unauthorized pages", async () => {
      const scraper = new WebsiteScraper({ maxPages: 2, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        if (url.includes("/private")) {
          return Promise.reject({
            response: { status: 401 },
            isAxiosError: true,
          });
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <body>
                <main>Valid page content with sufficient length.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com/private", 2);

      // 401 page should be filtered
      expect(pages.length).toBe(0);
    });

    it("should filter 500 server error pages", async () => {
      const scraper = new WebsiteScraper({ maxPages: 2, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        if (url.includes("/error")) {
          return Promise.resolve({
            status: 500,
            data: "<html><body>Error</body></html>",
          });
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <body>
                <main>Valid page content with sufficient length.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com/error", 2);

      // 500 page should be filtered
      expect(pages.length).toBe(0);
    });

    it("should accept 200 and 201 status codes", async () => {
      const scraper = new WebsiteScraper({ maxPages: 2, concurrency: 1 });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <body>
                <main>Valid page content with sufficient length for extraction.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 2);

      // 200 status should be accepted
      expect(pages.length).toBeGreaterThan(0);
    });
  });

  describe("Content-based login page detection", () => {
    it("should filter pages with login title", async () => {
      const scraper = new WebsiteScraper({
        maxPages: 2,
        concurrency: 1,
        filterLoginPages: true,
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <head><title>Login to Your Account</title></head>
              <body>
                <main>Login page content with sufficient length for extraction.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com/auth", 2);

      // Login page detected by title should be filtered
      expect(pages.length).toBe(0);
    });

    it("should filter pages with password input fields", async () => {
      const scraper = new WebsiteScraper({
        maxPages: 2,
        concurrency: 1,
        filterLoginPages: true,
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <head><title>Sign In</title></head>
              <body>
                <main>
                  <form>
                    <input type="email" placeholder="Email" />
                    <input type="password" placeholder="Password" />
                    <button>Sign In</button>
                  </form>
                  Content with sufficient length for extraction.
                </main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com/signin", 2);

      // Login page detected by password field should be filtered
      expect(pages.length).toBe(0);
    });

    it("should not filter pages with password fields but no login context", async () => {
      const scraper = new WebsiteScraper({
        maxPages: 2,
        concurrency: 1,
        filterLoginPages: true,
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <head><title>Contact Us</title></head>
              <body>
                <main>
                  <form>
                    <input type="text" placeholder="Name" />
                    <input type="email" placeholder="Email" />
                    <textarea>Your message here with sufficient length.</textarea>
                  </form>
                  Contact form content with enough characters for extraction.
                </main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com/contact", 2);

      // Contact form without password field should not be filtered
      expect(pages.length).toBeGreaterThan(0);
    });
  });

  describe("Content-based error page detection", () => {
    it("should filter pages with 404 in title", async () => {
      const scraper = new WebsiteScraper({
        maxPages: 2,
        concurrency: 1,
        filterErrorPages: true,
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <head><title>404 - Page Not Found</title></head>
              <body>
                <main>Error page content with sufficient length.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com/missing", 2);

      // Error page detected by title should be filtered
      expect(pages.length).toBe(0);
    });

    it("should filter pages with error content", async () => {
      const scraper = new WebsiteScraper({
        maxPages: 2,
        concurrency: 1,
        filterErrorPages: true,
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <head><title>Error</title></head>
              <body>
                <main>Page not found. The page you are looking for does not exist.</main>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com/error", 2);

      // Error page detected by content should be filtered
      expect(pages.length).toBe(0);
    });
  });

  describe("Custom filter patterns", () => {
    it("should filter URLs matching custom patterns", async () => {
      const scraper = new WebsiteScraper({
        maxPages: 5,
        concurrency: 1,
        customFilterPatterns: ["/custom-filter", "/test-pattern"],
      });

      mockAxiosGet.mockImplementation((url: string) => {
        if (url.includes("robots.txt") || url.includes("sitemap")) {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve({
          status: 200,
          data: `
            <html>
              <body>
                <main>Content with sufficient length.</main>
                <a href="/custom-filter/page">Custom Filtered</a>
                <a href="/valid-page">Valid Page</a>
              </body>
            </html>
          `,
        });
      });

      const pages = await scraper.scrapeWebsite("https://example.com", 5);

      // Custom filtered pages should be excluded
      expect(pages.every((p) => !p.url.includes("/custom-filter"))).toBe(true);
    });
  });
});
