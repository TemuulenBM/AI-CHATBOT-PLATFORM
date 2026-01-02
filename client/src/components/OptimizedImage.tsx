import { useState, useEffect, useRef } from "react";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  sizes?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export function OptimizedImage({
  src,
  alt,
  className = "",
  width,
  height,
  priority = false,
  sizes = "100vw",
  onLoad,
  onError,
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    // Use Intersection Observer for lazy loading (unless priority)
    if (!priority && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target as HTMLImageElement;
              if (img.dataset.src) {
                img.src = img.dataset.src;
                img.srcset = img.dataset.srcset || "";
              }
              observer.unobserve(img);
            }
          });
        },
        {
          rootMargin: "50px",
        }
      );

      if (imgRef.current) {
        observer.observe(imgRef.current);
      }

      return () => observer.disconnect();
    }
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Generate srcset for responsive images
  const generateSrcSet = (baseSrc: string) => {
    if (baseSrc.includes("?")) return "";

    const formats = ["webp", "avif"];
    const widths = [400, 800, 1200];

    // For vite-imagetools
    const webpSrcSet = widths
      .map((w) => `${baseSrc}?format=webp&w=${w} ${w}w`)
      .join(", ");

    return webpSrcSet;
  };

  const srcSet = generateSrcSet(src);

  if (hasError) {
    return (
      <div
        className={`bg-gray-200 flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <span className="text-gray-500">Failed to load</span>
      </div>
    );
  }

  return (
    <picture>
      {/* AVIF format for modern browsers */}
      {srcSet && (
        <source
          type="image/avif"
          srcSet={src.includes("?") ? undefined : `${src}?format=avif&w=400 400w, ${src}?format=avif&w=800 800w, ${src}?format=avif&w=1200 1200w`}
          sizes={sizes}
        />
      )}

      {/* WebP format fallback */}
      {srcSet && (
        <source type="image/webp" srcSet={srcSet} sizes={sizes} />
      )}

      {/* Original format fallback */}
      <img
        ref={imgRef}
        src={priority ? src : undefined}
        data-src={priority ? undefined : src}
        data-srcset={priority ? undefined : srcSet}
        alt={alt}
        width={width}
        height={height}
        className={`${className} ${
          isLoaded ? "opacity-100" : "opacity-0"
        } transition-opacity duration-300`}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
      />
    </picture>
  );
}
