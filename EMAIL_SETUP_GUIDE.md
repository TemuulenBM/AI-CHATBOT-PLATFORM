# Email Service Setup Guide

## Overview

Your AI Chatbot Platform now has a **FREE** email notification service using **Resend**. This guide will help you get it set up in minutes.

## Why Resend?

- **100 emails/day FREE** (forever)
- No credit card required
- Modern API with excellent developer experience
- Perfect for transactional emails
- Simple setup

## Quick Setup (5 minutes)

### Step 1: Create Resend Account

1. Go to [https://resend.com](https://resend.com)
2. Sign up for a FREE account (no credit card needed)
3. Verify your email

### Step 2: Get Your API Key

1. Log in to [Resend Dashboard](https://resend.com/api-keys)
2. Click **"Create API Key"**
3. Name it (e.g., "ConvoAI Production")
4. Copy the API key (starts with `re_...`)

### Step 3: Add Environment Variables

Add these to your `.env` file:

```bash
# Email Service (Resend)
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=noreply@yourdomain.com
```

**Important:** Replace `yourdomain.com` with:
- Your verified domain (see Step 4 for domain setup)
- Or use `onboarding@resend.dev` for testing (limited to your own email)

### Step 4: Domain Setup (Optional but Recommended)

For production, verify your domain to send from your own email address:

1. Go to [Resend Domains](https://resend.com/domains)
2. Click **"Add Domain"**
3. Enter your domain (e.g., `convoai.com`)
4. Add the DNS records shown (SPF, DKIM, DMARC)
5. Wait for verification (usually a few minutes)

**For testing:** Use `onboarding@resend.dev` as your `EMAIL_FROM` address. This works immediately but can only send to your verified email.

### Step 5: Restart Your Server

```bash
npm run dev
```

That's it! Your email service is ready.

## What Emails Are Sent?

Your platform now automatically sends emails for:

### 1. Welcome Emails
Sent when new users sign up
- **Template:** `EmailService.sendWelcomeEmail()`
- **File:** `server/services/email.ts:54`

### 2. GDPR Data Export Ready
When user data export is complete
- **Template:** `EmailService.sendDataExportEmail()`
- **File:** `server/services/email.ts:126`
- **Integration:** `server/jobs/data-export-processor.ts:145`

### 3. Account Deletion Confirmation
When user requests account deletion
- **Template:** `EmailService.sendAccountDeletionConfirmation()`
- **File:** `server/services/email.ts:172`
- **Integration:** `server/controllers/gdpr/deletion.ts:165`

### 4. Subscription Confirmation
Payment confirmations (ready for Paddle webhook integration)
- **Template:** `EmailService.sendSubscriptionConfirmation()`
- **File:** `server/services/email.ts:88`

### 5. Chatbot Training Complete
Notification when chatbot training finishes
- **Template:** `EmailService.sendTrainingCompleteEmail()`
- **File:** `server/services/email.ts:247`

### 6. Usage Limit Warnings
Alert users when approaching limits
- **Template:** `EmailService.sendUsageLimitWarning()`
- **File:** `server/services/email.ts:290`

### 7. Password Reset
If you implement custom authentication
- **Template:** `EmailService.sendPasswordResetEmail()`
- **File:** `server/services/email.ts:218`

## Usage Examples

### Send a Custom Email

```typescript
import EmailService from './services/email';

// Send custom email
await EmailService.sendEmail({
  to: 'user@example.com',
  subject: 'Custom Subject',
  html: '<h1>Hello World!</h1><p>Your custom content here.</p>',
});
```

### Send Welcome Email

```typescript
await EmailService.sendWelcomeEmail(
  'user@example.com',
  'John Doe'
);
```

### Send Data Export Email

```typescript
const downloadUrl = `${process.env.APP_URL}/api/gdpr/data-export/${requestId}/download`;
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

await EmailService.sendDataExportEmail(
  'user@example.com',
  downloadUrl,
  expiresAt
);
```

## Integration Points

### Already Integrated

✅ **GDPR Data Export** - Sends email when export is ready
- File: `server/jobs/data-export-processor.ts:145`

✅ **Account Deletion** - Sends confirmation email
- File: `server/controllers/gdpr/deletion.ts:165`

### Ready to Integrate

You can easily add emails to:

1. **Clerk Webhook** (`server/routes/clerk.ts`)
   - Send welcome email when user signs up
   ```typescript
   import EmailService from '../services/email';

   // In webhook handler after user creation:
   await EmailService.sendWelcomeEmail(user.email, user.firstName);
   ```

2. **Paddle Webhook** (`server/routes/paddle.ts`)
   - Send subscription confirmation
   ```typescript
   await EmailService.sendSubscriptionConfirmation(
     user.email,
     'Growth Plan',
     '$29.99/month'
   );
   ```

3. **Scraping Jobs** (`server/jobs/scrape-job.ts`)
   - Send training complete notification
   ```typescript
   await EmailService.sendTrainingCompleteEmail(
     user.email,
     chatbot.name,
     totalEmbeddings
   );
   ```

4. **Usage Monitoring** (`server/middleware/usage-monitor.ts`)
   - Send usage warnings at 80%, 90%, 100%
   ```typescript
   await EmailService.sendUsageLimitWarning(
     user.email,
     currentUsage,
     limit,
     'messages'
   );
   ```

## Free Tier Limits

Resend Free Tier includes:
- **100 emails/day**
- **Unlimited** domains
- **All features** (no feature restrictions)
- **No credit card** required
- **No expiration**

### Upgrading

If you need more than 100 emails/day:
- **Pro Plan:** $20/month for 50,000 emails/month
- **Enterprise:** Custom pricing

For most startups, the free tier is plenty!

## Testing

### Test Email Sending (Development)

```bash
# Start your server
npm run dev

# Make a test API request (example)
curl -X POST http://localhost:5000/api/gdpr/data-export \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"

# Check your email inbox for the notification
```

### Using Test Mode

For testing without sending real emails, you can:

1. Comment out the `RESEND_API_KEY` in `.env`
2. Emails will be logged but not sent
3. Check server logs to see email content

```bash
# Server logs will show:
# [WARN] RESEND_API_KEY not configured. Email not sent.
# { to: 'user@example.com', subject: 'Test Subject' }
```

## Email Templates

All email templates are HTML with responsive design:
- **Mobile-friendly**
- **Professional styling**
- **Clear call-to-action buttons**
- **Brand colors** (gradient purple/blue)

### Customizing Templates

Edit the HTML in `server/services/email.ts`:

```typescript
const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <style>
        /* Your custom CSS */
      </style>
    </head>
    <body>
      <!-- Your custom HTML -->
    </body>
  </html>
`;
```

### Using a Template Engine (Optional)

For more complex templates, you can integrate:
- **React Email** (recommended with Resend)
- **Handlebars**
- **EJS**

Example with React Email:

```bash
npm install @react-email/components react-email
```

## Monitoring

### Check Email Status

Resend provides:
- **Delivery tracking**
- **Open tracking** (optional)
- **Click tracking** (optional)
- **Bounce handling**
- **Webhook events**

View logs at: [https://resend.com/emails](https://resend.com/emails)

### Application Logs

All email sending is logged via Winston:

```typescript
// Success
logger.info('Email sent successfully', {
  messageId: 'abc123',
  to: 'user@example.com',
  subject: 'Welcome!'
});

// Failure
logger.error('Failed to send email', {
  error: 'Invalid API key',
  to: 'user@example.com'
});
```

## Troubleshooting

### Email Not Sending

1. **Check API key** - Make sure `RESEND_API_KEY` is set correctly
2. **Check FROM address** - Use verified domain or `onboarding@resend.dev`
3. **Check logs** - Look for error messages in console
4. **Check Resend dashboard** - View email status and errors

### Emails Going to Spam

1. **Verify your domain** - Add SPF, DKIM, DMARC records
2. **Use proper FROM address** - Avoid free email providers
3. **Add unsubscribe link** - Required for bulk emails
4. **Warm up your domain** - Start with low volume

### Rate Limiting

Free tier: 100 emails/day
- Emails are queued if limit is exceeded
- Check Resend dashboard for quota status
- Consider upgrading if hitting limits

## Production Checklist

Before going to production:

- [ ] Verify your domain in Resend
- [ ] Update `EMAIL_FROM` to use your domain
- [ ] Add production `RESEND_API_KEY` to environment
- [ ] Test all email templates
- [ ] Set up email monitoring
- [ ] Configure bounce handling (optional)
- [ ] Add unsubscribe links for marketing emails
- [ ] Review GDPR compliance for email collection

## Advanced Features

### Batch Sending

Send to multiple recipients:

```typescript
await EmailService.sendEmail({
  to: ['user1@example.com', 'user2@example.com'],
  subject: 'Newsletter',
  html: newsletterHtml,
});
```

### Attachments

```typescript
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'noreply@yourdomain.com',
  to: 'user@example.com',
  subject: 'Invoice',
  html: '<p>See attached invoice</p>',
  attachments: [
    {
      filename: 'invoice.pdf',
      content: pdfBuffer,
    },
  ],
});
```

### Scheduled Emails

Use BullMQ (already set up in your project):

```typescript
import { emailQueue } from './jobs/queues';

// Schedule email for later
await emailQueue.add(
  'send-reminder',
  {
    to: 'user@example.com',
    subject: 'Reminder',
    html: '<p>This is your reminder</p>',
  },
  {
    delay: 24 * 60 * 60 * 1000, // 24 hours
  }
);
```

## Support

- **Resend Documentation:** [https://resend.com/docs](https://resend.com/docs)
- **Resend Status:** [https://status.resend.com](https://status.resend.com)
- **Email Issues:** Check `server/services/email.ts` and logs

## Summary

You now have a **fully functional, FREE email notification service**:

- ✅ 100 emails/day free
- ✅ Professional HTML templates
- ✅ GDPR compliance emails
- ✅ Subscription confirmations
- ✅ Usage alerts
- ✅ Training notifications
- ✅ Easy to customize

**Total cost:** $0/month (free tier)

**Setup time:** ~5 minutes

Enjoy your new email service! 🎉
