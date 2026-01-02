/**
 * CDN Configuration and Utilities
 *
 * This module provides utilities for integrating with external CDN providers
 * like Cloudinary, Cloudflare Images, or imgix for advanced image optimization.
 *
 * By default, the application uses Vercel Edge Network as the primary CDN.
 * External CDN providers are optional and can be configured via environment variables.
 */

interface CDNConfig {
  provider: "vercel" | "cloudinary" | "cloudflare" | "imgix";
  cloudName?: string;
  baseURL?: string;
  apiKey?: string;
}

// CDN Configuration from environment variables
const CDN_CONFIG: CDNConfig = {
  provider: (import.meta.env.VITE_CDN_PROVIDER as CDNConfig["provider"]) || "vercel",
  cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
  baseURL: import.meta.env.VITE_CDN_BASE_URL,
  apiKey: import.meta.env.VITE_CDN_API_KEY,
};

interface ImageTransformOptions {
  width?: number;
  height?: number;
  format?: "webp" | "avif" | "jpg" | "png";
  quality?: number;
  fit?: "cover" | "contain" | "fill" | "scale-down";
}

/**
 * Generate Cloudinary URL with transformations
 */
function getCloudinaryURL(
  publicId: string,
  options: ImageTransformOptions = {}
): string {
  const { cloudName } = CDN_CONFIG;
  if (!cloudName) {
    console.warn("Cloudinary cloud name not configured");
    return publicId;
  }

  const transformations: string[] = [];

  if (options.width) transformations.push(`w_${options.width}`);
  if (options.height) transformations.push(`h_${options.height}`);
  if (options.quality) transformations.push(`q_${options.quality}`);
  if (options.format) transformations.push(`f_${options.format}`);
  if (options.fit) {
    const fitMap = {
      cover: "c_fill",
      contain: "c_fit",
      fill: "c_scale",
      "scale-down": "c_limit",
    };
    transformations.push(fitMap[options.fit]);
  }

  // Auto format and quality
  transformations.push("f_auto", "q_auto");

  const transformStr = transformations.join(",");
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformStr}/${publicId}`;
}

/**
 * Generate Cloudflare Images URL with transformations
 */
function getCloudflareURL(
  imageId: string,
  options: ImageTransformOptions = {}
): string {
  const { baseURL } = CDN_CONFIG;
  if (!baseURL) {
    console.warn("Cloudflare Images base URL not configured");
    return imageId;
  }

  const params = new URLSearchParams();

  if (options.width) params.set("width", options.width.toString());
  if (options.height) params.set("height", options.height.toString());
  if (options.format) params.set("format", options.format);
  if (options.quality) params.set("quality", options.quality.toString());
  if (options.fit) params.set("fit", options.fit);

  const queryString = params.toString();
  return `${baseURL}/${imageId}${queryString ? `?${queryString}` : ""}`;
}

/**
 * Generate imgix URL with transformations
 */
function getImgixURL(
  path: string,
  options: ImageTransformOptions = {}
): string {
  const { baseURL } = CDN_CONFIG;
  if (!baseURL) {
    console.warn("imgix base URL not configured");
    return path;
  }

  const params = new URLSearchParams();

  if (options.width) params.set("w", options.width.toString());
  if (options.height) params.set("h", options.height.toString());
  if (options.format) params.set("fm", options.format);
  if (options.quality) params.set("q", options.quality.toString());
  if (options.fit) {
    const fitMap = {
      cover: "crop",
      contain: "fit",
      fill: "scale",
      "scale-down": "max",
    };
    params.set("fit", fitMap[options.fit]);
  }

  // Auto optimization
  params.set("auto", "format,compress");

  const queryString = params.toString();
  return `${baseURL}${path}?${queryString}`;
}

/**
 * Main function to get CDN URL based on configured provider
 */
export function getCDNUrl(
  assetPath: string,
  options: ImageTransformOptions = {}
): string {
  switch (CDN_CONFIG.provider) {
    case "cloudinary":
      return getCloudinaryURL(assetPath, options);
    case "cloudflare":
      return getCloudflareURL(assetPath, options);
    case "imgix":
      return getImgixURL(assetPath, options);
    case "vercel":
    default:
      // For Vercel, use vite-imagetools query params
      if (options.width || options.format) {
        const params = new URLSearchParams();
        if (options.width) params.set("w", options.width.toString());
        if (options.format) params.set("format", options.format);
        if (options.quality) params.set("quality", options.quality.toString());
        return `${assetPath}?${params.toString()}`;
      }
      return assetPath;
  }
}

/**
 * Generate responsive image srcset
 */
export function generateSrcSet(
  assetPath: string,
  widths: number[] = [400, 800, 1200, 1600]
): string {
  return widths
    .map((width) => {
      const url = getCDNUrl(assetPath, { width, format: "webp" });
      return `${url} ${width}w`;
    })
    .join(", ");
}

/**
 * Preload critical images
 */
export function preloadImage(src: string, as: "image" = "image"): void {
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = as;
  link.href = src;
  document.head.appendChild(link);
}

/**
 * Get optimal image format based on browser support
 */
export function getSupportedFormat(): "avif" | "webp" | "jpg" {
  if (typeof window === "undefined") return "webp";

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;

  // Check AVIF support
  if (canvas.toDataURL("image/avif").indexOf("data:image/avif") === 0) {
    return "avif";
  }

  // Check WebP support
  if (canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0) {
    return "webp";
  }

  return "jpg";
}

export default {
  getCDNUrl,
  generateSrcSet,
  preloadImage,
  getSupportedFormat,
};
