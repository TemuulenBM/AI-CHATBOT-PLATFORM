# Render.com Deployment Checklist

## 🎯 Quick Fix for Production Widget

Your widget isn't loading due to missing environment variables. Follow these steps:

### 1. Set Environment Variables in Render.com

**Go to:** Render.com Dashboard → Your Service → Environment

**Add these variables:**

```bash
# Backend URL (your Render.com URL)
APP_URL=https://ai-chatbot-platform-iiuf.onrender.com

# CORS - Frontend domains that can access your API
# Replace with your actual frontend domain(s)
ALLOWED_ORIGINS=https://convo-ai-eight.vercel.app

# Trust reverse proxy (required for Render.com)
TRUST_PROXY=true

# Make sure this is set to production
NODE_ENV=production
```

### 2. Verify Existing Variables

Make sure these are already set (don't change if they exist):

- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_KEY`
- ✅ `REDIS_URL`
- ✅ `OPENAI_API_KEY`
- ✅ `CLERK_SECRET_KEY`
- ✅ `CLERK_PUBLISHABLE_KEY`

### 3. Deploy

After adding the environment variables:

1. **Save** the environment variables
2. Render will **automatically redeploy** your service
3. Wait for deployment to complete (~2-5 minutes)

### 4. Test the Widget

Once deployed, test at:
```
https://ai-chatbot-platform-iiuf.onrender.com/widget/demo?id=f724957-329e-408c-a27a-e39f16d42a90
```

You should see:
- ✅ Widget loads without CSP errors
- ✅ Chat interface is visible
- ✅ No console errors

### 5. Update Frontend Embed Code (Optional)

If you're using the widget on your Vercel frontend, make sure the script tag points to your backend:

```html
<script async
  src="https://ai-chatbot-platform-iiuf.onrender.com/widget.js"
  data-chatbot-id="f724957-329e-408c-a27a-e39f16d42a90"
></script>
```

---

## 📊 What These Variables Do

| Variable | Purpose |
|----------|---------|
| `APP_URL` | Your backend URL - used for CORS and CSP configuration |
| `ALLOWED_ORIGINS` | Frontend domains allowed to make API calls |
| `TRUST_PROXY` | Trust X-Forwarded-* headers from Render's reverse proxy |
| `NODE_ENV` | Enables production optimizations and security settings |

---

## 🐛 Still Having Issues?

**Check Render Logs:**
1. Go to Render Dashboard → Your Service → Logs
2. Look for errors related to CSP or CORS
3. Check if the service started successfully

**Common Issues:**

❌ **Widget still blocked?**
- Verify `ALLOWED_ORIGINS` includes your frontend domain
- Check browser console for exact CSP error

❌ **Service won't start?**
- Check Render logs for startup errors
- Verify all required environment variables are set

❌ **Widget loads but can't connect?**
- Verify `APP_URL` matches your Render.com URL exactly
- Check CORS headers in Network tab

---

**Need help?** Check the full guide: `PRODUCTION_WIDGET_FIX.md`
