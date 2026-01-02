# CDN Implementation Guide

## Overview

This AI-Chatbot-Platform uses a multi-layered CDN strategy for optimal global performance:

1. **Vercel Edge Network** (Primary CDN) - 85+ global edge locations
2. **Vite Image Optimization** - Build-time image compression and modern format conversion
3. **Optional External CDN** - Cloudinary, Cloudflare Images, or imgix integration

---

## Architecture

### Current Setup

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Browser                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Vercel Edge Network (CDN)                      │
│  • 85+ global edge locations                                │
│  • Automatic cache management                               │
│  • Static asset caching (1 year)                            │
│  • Stale-while-revalidate support                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┴────────────────┐
        ▼                                ▼
┌──────────────────┐          ┌─────────────────────┐
│  Static Assets   │          │  API Routes         │
│  (Vercel CDN)    │          │  (Render.com)       │
└──────────────────┘          └─────────────────────┘
```

### Asset Flow

```
Source Images (attached_assets/)
        │
        ▼
Vite Build Process
  • Image compression (vite-plugin-imagemin)
  • Format conversion (vite-imagetools)
  • WebP/AVIF generation
  • Content-hash naming
        │
        ▼
Build Output (dist/public/assets/)
        │
        ▼
Vercel Edge Deployment
  • Distributed to 85+ edge locations
  • Served with optimal cache headers
  • Automatic compression (Brotli/gzip)
```

---

## Configuration

### 1. Vercel Edge Network (Default)

**File:** `vercel.json`

**Cache Headers:**
- **Hashed Assets** (`/assets/*`): 1 year immutable cache
- **Images**: 1 day browser, 7 days CDN, 30 days stale-while-revalidate
- **JS/CSS**: 1 year immutable cache
- **HTML**: No cache, must revalidate

**Edge Regions:**
- North America: `iad1` (Washington, D.C.), `sfo1` (San Francisco)
- Europe: `lhr1` (London)
- Asia: `hnd1` (Tokyo)
- Oceania: `syd1` (Sydney)

### 2. Image Optimization (vite-imagetools)

**File:** `vite.config.ts`

**Automatic Transformations:**
- Multi-format output: WebP, AVIF, JPG
- Responsive widths: 400px, 800px, 1200px
- Quality: 80%
- Lossless compression

**Usage:**
```tsx
import heroImage from "@assets/generated_images/hero.png";

// Vite automatically generates:
// - hero.png?format=webp&w=400
// - hero.png?format=webp&w=800
// - hero.png?format=avif&w=400
// - etc.
```

### 3. Build Optimization

**Features:**
- Asset code splitting by type (images, fonts, js)
- Manual chunks for vendors and UI libraries
- Inline assets < 4KB (base64)
- CSS code splitting
- ESBuild minification

**Output Structure:**
```
dist/public/
├── assets/
│   ├── images/
│   │   └── hero-[hash].webp
│   ├── fonts/
│   │   └── inter-[hash].woff2
│   └── js/
│       ├── vendor-[hash].js
│       └── ui-[hash].js
└── index.html
```

---

## Using the OptimizedImage Component

### Basic Usage

```tsx
import { OptimizedImage } from "@/components/OptimizedImage";
import heroImage from "@assets/generated_images/hero.png";

export function MyComponent() {
  return (
    <OptimizedImage
      src={heroImage}
      alt="Hero image"
      width={800}
      height={600}
    />
  );
}
```

### Advanced Usage

```tsx
<OptimizedImage
  src={heroImage}
  alt="Hero image"
  width={1200}
  height={800}
  priority={true}  // Disable lazy loading for above-the-fold images
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 800px"
  className="rounded-lg shadow-xl"
  onLoad={() => console.log("Image loaded")}
  onError={() => console.error("Image failed to load")}
/>
```

### Features

- **Lazy Loading**: Automatically lazy loads images below the fold using Intersection Observer
- **Priority Loading**: Set `priority={true}` for critical images (hero, above-the-fold)
- **Responsive Images**: Automatically generates `srcset` with multiple sizes
- **Modern Formats**: Uses AVIF first, falls back to WebP, then original format
- **Progressive Enhancement**: Works without JavaScript (native lazy loading)
- **Error Handling**: Displays fallback UI on load failure
- **Fade-in Animation**: Smooth opacity transition when loaded

---

## External CDN Integration (Optional)

### Cloudinary Setup

**1. Create Account:**
- Visit: https://cloudinary.com/console
- Get your Cloud Name from Dashboard

**2. Configure Environment:**
```env
# .env
VITE_CDN_PROVIDER=cloudinary
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_API_KEY=your-api-key
```

**3. Upload Images:**
Use Cloudinary's upload API or dashboard to upload your images.

**4. Use CDN Helper:**
```tsx
import { getCDNUrl } from "@/lib/cdn";

const imageUrl = getCDNUrl("hero-image", {
  width: 800,
  format: "webp",
  quality: 80,
  fit: "cover"
});

// Result: https://res.cloudinary.com/your-cloud/image/upload/w_800,q_80,f_webp,c_fill/hero-image
```

### Cloudflare Images Setup

**1. Enable Cloudflare Images:**
- Cloudflare Dashboard > Images
- Get your Account Hash

**2. Configure Environment:**
```env
VITE_CDN_PROVIDER=cloudflare
VITE_CDN_BASE_URL=https://imagedelivery.net/YOUR_ACCOUNT_HASH
```

**3. Upload Images:**
```bash
curl -X POST \
  https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/images/v1 \
  -H "Authorization: Bearer API_TOKEN" \
  -F file=@./hero.png
```

**4. Use CDN Helper:**
```tsx
import { getCDNUrl } from "@/lib/cdn";

const imageUrl = getCDNUrl("image-id", {
  width: 800,
  format: "webp"
});
```

### imgix Setup

**1. Create Source:**
- Dashboard: https://dashboard.imgix.com/
- Create a Web Folder or S3 source

**2. Configure Environment:**
```env
VITE_CDN_PROVIDER=imgix
VITE_CDN_BASE_URL=https://your-source.imgix.net
VITE_CDN_API_KEY=your-api-key
```

**3. Use CDN Helper:**
```tsx
const imageUrl = getCDNUrl("/path/to/image.jpg", {
  width: 800,
  format: "webp",
  quality: 80
});

// Result: https://your-source.imgix.net/path/to/image.jpg?w=800&fm=webp&q=80&auto=format,compress
```

---

## CDN Utilities API

### `getCDNUrl(assetPath, options)`

Generate optimized CDN URL based on configured provider.

**Parameters:**
- `assetPath` (string): Path or ID of the image
- `options` (object):
  - `width` (number): Target width in pixels
  - `height` (number): Target height in pixels
  - `format` (string): 'webp' | 'avif' | 'jpg' | 'png'
  - `quality` (number): 1-100
  - `fit` (string): 'cover' | 'contain' | 'fill' | 'scale-down'

**Returns:** Optimized URL string

### `generateSrcSet(assetPath, widths)`

Generate responsive srcset string.

```tsx
import { generateSrcSet } from "@/lib/cdn";

const srcset = generateSrcSet(heroImage, [400, 800, 1200, 1600]);
// Returns: "hero.png?w=400 400w, hero.png?w=800 800w, ..."
```

### `preloadImage(src)`

Preload critical images for better performance.

```tsx
import { preloadImage } from "@/lib/cdn";

// In your component or route loader
useEffect(() => {
  preloadImage(heroImage);
}, []);
```

### `getSupportedFormat()`

Detect browser's best supported format.

```tsx
import { getSupportedFormat } from "@/lib/cdn";

const format = getSupportedFormat();
// Returns: 'avif' | 'webp' | 'jpg'
```

---

## Performance Best Practices

### 1. Image Optimization Checklist

- [ ] Use OptimizedImage component for all images
- [ ] Set `priority={true}` for above-the-fold images
- [ ] Provide explicit width/height to prevent layout shift
- [ ] Use appropriate `sizes` attribute for responsive images
- [ ] Optimize source images before adding to `attached_assets/`
- [ ] Use vector SVG for logos and icons when possible

### 2. Cache Strategy

**Static Assets (Hashed):**
- Cache: 1 year (immutable)
- Strategy: Cache-first
- Busting: Automatic via content hash

**Images (Non-hashed):**
- Browser Cache: 1 day
- CDN Cache: 7 days
- Stale-while-revalidate: 30 days
- Strategy: Stale-while-revalidate

**HTML:**
- Cache: 0 (must revalidate)
- Strategy: Network-first

### 3. Responsive Images

**Mobile-first sizes:**
```tsx
sizes="(max-width: 640px) 100vw,
       (max-width: 1024px) 50vw,
       800px"
```

**Common breakpoints:**
- Mobile: 400px, 640px
- Tablet: 768px, 1024px
- Desktop: 1280px, 1536px, 1920px

### 4. Format Priority

1. **AVIF** - Best compression (50% smaller than WebP)
2. **WebP** - Good compression, wide support
3. **JPEG** - Universal fallback

The OptimizedImage component automatically uses this priority via `<picture>` element.

---

## Monitoring and Analytics

### 1. Vercel Analytics

Enable in Vercel Dashboard:
- Real User Monitoring (RUM)
- Web Vitals tracking
- CDN cache hit rates
- Edge function performance

### 2. Lighthouse Metrics

Target scores:
- Performance: > 90
- Largest Contentful Paint (LCP): < 2.5s
- First Contentful Paint (FCP): < 1.8s
- Cumulative Layout Shift (CLS): < 0.1

### 3. CDN Cache Hit Rate

Monitor in Vercel Analytics:
- Target: > 95% cache hit rate
- Miss scenarios: First visit, cache expiration, deployment

---

## Troubleshooting

### Images Not Loading

**Check:**
1. Vite build completed successfully
2. Images exist in `dist/public/assets/images/`
3. Network tab shows 200 status
4. Console has no CORS errors

**Solution:**
```bash
# Rebuild with verbose logging
npm run build -- --debug
```

### Slow Image Loading

**Diagnose:**
1. Check image file sizes in `dist/public/assets/`
2. Verify cache headers in Network tab
3. Test from different geographic locations

**Solution:**
```tsx
// Add priority loading for critical images
<OptimizedImage priority={true} />

// Or preload manually
import { preloadImage } from "@/lib/cdn";
preloadImage(heroImage);
```

### Cache Not Working

**Check Vercel Headers:**
```bash
curl -I https://your-app.vercel.app/assets/hero-abc123.webp
# Should show: Cache-Control: public, max-age=31536000, immutable
```

**Solution:**
1. Verify `vercel.json` headers configuration
2. Clear Vercel cache: Dashboard > Deployments > [deployment] > More > Clear Cache
3. Test with `?v=timestamp` query param to bust cache

---

## Migration Guide

### From Standard `<img>` to OptimizedImage

**Before:**
```tsx
<img src={heroImage} alt="Hero" className="w-full" />
```

**After:**
```tsx
import { OptimizedImage } from "@/components/OptimizedImage";

<OptimizedImage
  src={heroImage}
  alt="Hero"
  className="w-full"
  width={1200}
  height={800}
  priority={false}
  sizes="100vw"
/>
```

### From External CDN to Vercel

**Steps:**
1. Download images from external CDN
2. Place in `attached_assets/generated_images/`
3. Update imports to use Vite asset imports
4. Run `npm run build`
5. Deploy to Vercel

---

## Cost Optimization

### Vercel Edge Network

**Pricing:**
- Free tier: 100GB bandwidth/month
- Pro: $20/month + $0.10/GB
- Enterprise: Custom pricing

**Optimization Tips:**
1. Use aggressive caching (1 year for hashed assets)
2. Enable compression (automatic)
3. Optimize images at build time (reduce bandwidth)
4. Use stale-while-revalidate to reduce origin requests

### External CDN Costs

**Cloudinary:**
- Free: 25GB storage, 25GB bandwidth/month
- Plus: $89/month - 100GB storage, 100GB bandwidth

**Cloudflare Images:**
- $5/month per 100,000 images stored
- $1/month per 100,000 images delivered

**imgix:**
- $10/month - 10,000 images, 10GB bandwidth
- $99/month - 100,000 images, 100GB bandwidth

---

## Additional Resources

- [Vercel Edge Network Docs](https://vercel.com/docs/edge-network/overview)
- [vite-imagetools Documentation](https://github.com/JonasKruckenberg/imagetools)
- [Web.dev Image Optimization Guide](https://web.dev/fast/#optimize-your-images)
- [Cloudinary Transformation Reference](https://cloudinary.com/documentation/image_transformations)
- [MDN Picture Element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/picture)

---

## Support

For issues or questions:
1. Check this documentation first
2. Review Vercel deployment logs
3. Inspect Network tab for CDN headers
4. Contact support with:
   - Deployment URL
   - Image path
   - Network waterfall screenshot
   - Console errors
