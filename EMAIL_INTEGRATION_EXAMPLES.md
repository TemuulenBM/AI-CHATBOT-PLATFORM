# Email Integration Examples

Quick copy-paste examples to add email notifications throughout your app.

## 1. Welcome Email on User Signup (Clerk Webhook)

**File:** `server/routes/clerk.ts`

```typescript
import EmailService from '../services/email';

// In your Clerk webhook handler (user.created event):
if (evt.type === 'user.created') {
  const { id, email_addresses, first_name } = evt.data;
  const email = email_addresses[0]?.email_address;

  // Send welcome email
  if (email) {
    await EmailService.sendWelcomeEmail(email, first_name || 'there');
    logger.info('Welcome email sent', { userId: id, email });
  }
}
```

## 2. Subscription Confirmation (Paddle Webhook)

**File:** `server/routes/paddle.ts`

```typescript
import EmailService from '../services/email';

// In your Paddle webhook handler (subscription.created):
if (event.event_type === 'subscription.created') {
  const { customer_email, subscription_plan_name, amount } = event.data;

  await EmailService.sendSubscriptionConfirmation(
    customer_email,
    subscription_plan_name,
    `$${(amount / 100).toFixed(2)}/month`
  );
}
```

## 3. Chatbot Training Complete Notification

**File:** `server/jobs/scrape-job.ts`

```typescript
import EmailService from '../services/email';

// After scraping and embeddings are complete:
const totalEmbeddings = await supabaseAdmin
  .from('embeddings')
  .select('*', { count: 'exact', head: true })
  .eq('chatbot_id', chatbotId);

// Get chatbot and user info
const { data: chatbot } = await supabaseAdmin
  .from('chatbots')
  .select('name, users!inner(email)')
  .eq('id', chatbotId)
  .single();

if (chatbot?.users?.email) {
  await EmailService.sendTrainingCompleteEmail(
    chatbot.users.email,
    chatbot.name,
    totalEmbeddings.count || 0
  );
}
```

## 4. Usage Limit Warnings

**File:** Create `server/middleware/usage-monitor.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../utils/supabase';
import EmailService from '../services/email';
import logger from '../utils/logger';

// Cache to prevent spam (send warning once per day)
const warningCache = new Map<string, number>();

export async function checkUsageLimits(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return next();

    // Get user's subscription
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_type, messages_count, usage_limits')
      .eq('user_id', userId)
      .single();

    if (!subscription) return next();

    const limit = subscription.usage_limits?.messages || 1000;
    const currentUsage = subscription.messages_count || 0;
    const percentUsed = (currentUsage / limit) * 100;

    // Send warning at 80%, 90%, 100%
    const thresholds = [80, 90, 100];
    for (const threshold of thresholds) {
      if (percentUsed >= threshold) {
        const cacheKey = `${userId}-${threshold}`;
        const lastSent = warningCache.get(cacheKey);
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

        // Send if not sent in last 24 hours
        if (!lastSent || lastSent < dayAgo) {
          const { data: user } = await supabaseAdmin
            .from('users')
            .select('email')
            .eq('id', userId)
            .single();

          if (user?.email) {
            await EmailService.sendUsageLimitWarning(
              user.email,
              currentUsage,
              limit,
              'messages'
            );
            warningCache.set(cacheKey, Date.now());
            logger.info('Usage warning sent', { userId, threshold, currentUsage, limit });
          }
        }
        break; // Only send one warning
      }
    }

    next();
  } catch (error) {
    logger.error('Usage check failed', { error });
    next(); // Don't block the request
  }
}
```

Then add to chat endpoint:

```typescript
// In server/routes/chat.ts
import { checkUsageLimits } from '../middleware/usage-monitor';

router.post('/chat', checkUsageLimits, async (req, res) => {
  // Your existing chat logic
});
```

## 5. Custom Email Template

Create a new email method in `server/services/email.ts`:

```typescript
/**
 * Send chatbot feedback summary email
 */
static async sendFeedbackSummary(
  to: string,
  chatbotName: string,
  stats: {
    totalFeedback: number;
    positiveCount: number;
    negativeCount: number;
    averageRating: number;
  }
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .stat-card { background: white; padding: 20px; border-radius: 5px; margin: 10px 0; display: flex; justify-content: space-between; align-items: center; }
          .stat-number { font-size: 32px; font-weight: bold; color: #667eea; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Weekly Feedback Summary</h1>
          </div>
          <div class="content">
            <p>Here's your weekly feedback summary for <strong>${chatbotName}</strong>:</p>

            <div class="stat-card">
              <div>
                <div style="color: #666;">Total Feedback</div>
                <div class="stat-number">${stats.totalFeedback}</div>
              </div>
            </div>

            <div class="stat-card">
              <div>
                <div style="color: #10b981;">Positive</div>
                <div class="stat-number" style="color: #10b981;">${stats.positiveCount}</div>
              </div>
              <div>
                <div style="color: #ef4444;">Negative</div>
                <div class="stat-number" style="color: #ef4444;">${stats.negativeCount}</div>
              </div>
            </div>

            <div class="stat-card">
              <div>
                <div style="color: #666;">Average Rating</div>
                <div class="stat-number">${stats.averageRating.toFixed(1)}/5.0</div>
              </div>
            </div>

            <a href="${process.env.APP_URL}/dashboard/chatbots/feedback" class="button">View Detailed Analytics</a>

            <p>Keep up the great work improving your chatbot!</p>
            <p>Best regards,<br>The ConvoAI Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await this.sendEmail({
    to,
    subject: `Weekly Feedback Summary - ${chatbotName}`,
    html,
  });
}
```

## 6. Scheduled Weekly Reports (Using BullMQ)

**File:** Create `server/jobs/weekly-reports.ts`

```typescript
import { Queue, Worker } from 'bullmq';
import { supabaseAdmin } from '../utils/supabase';
import EmailService from '../services/email';
import logger from '../utils/logger';
import { getRedisConnection } from './queue-connection';

// Create queue for weekly reports
export const weeklyReportQueue = new Queue('weekly-reports', {
  connection: getRedisConnection(),
});

// Worker to send weekly reports
export const weeklyReportWorker = new Worker(
  'weekly-reports',
  async () => {
    logger.info('Starting weekly report job');

    // Get all users with active chatbots
    const { data: users } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        chatbots!inner(id, name)
      `)
      .not('chatbots', 'is', null);

    for (const user of users || []) {
      for (const chatbot of user.chatbots) {
        // Get feedback stats
        const { data: feedback } = await supabaseAdmin
          .from('feedback')
          .select('rating, sentiment')
          .eq('chatbot_id', chatbot.id)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        const stats = {
          totalFeedback: feedback?.length || 0,
          positiveCount: feedback?.filter(f => f.sentiment === 'positive').length || 0,
          negativeCount: feedback?.filter(f => f.sentiment === 'negative').length || 0,
          averageRating: feedback?.reduce((acc, f) => acc + (f.rating || 0), 0) / (feedback?.length || 1),
        };

        // Send email
        await EmailService.sendFeedbackSummary(
          user.email,
          chatbot.name,
          stats
        );

        logger.info('Weekly report sent', { userId: user.id, chatbotId: chatbot.id });
      }
    }
  },
  {
    connection: getRedisConnection(),
  }
);

// Schedule to run every Monday at 9 AM
export async function scheduleWeeklyReports() {
  await weeklyReportQueue.add(
    'send-weekly-reports',
    {},
    {
      repeat: {
        pattern: '0 9 * * 1', // Every Monday at 9 AM
      },
    }
  );
  logger.info('Weekly reports scheduled');
}
```

Add to your server startup (`server/index.ts`):

```typescript
import { scheduleWeeklyReports } from './jobs/weekly-reports';

// After server starts:
await scheduleWeeklyReports();
```

## 7. Error Notification Email (For Critical Errors)

**File:** `server/utils/logger.ts`

Add email notification for critical errors:

```typescript
import EmailService from '../services/email';

// In your logger configuration, add a custom transport:
const emailTransport = new winston.transports.Stream({
  stream: {
    write: async (message: string) => {
      // Only send emails for critical errors in production
      if (process.env.NODE_ENV === 'production' && message.includes('"level":"error"')) {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@yourdomain.com';

        await EmailService.sendEmail({
          to: adminEmail,
          subject: '🚨 Critical Error in Production',
          html: `
            <h2>Critical Error Detected</h2>
            <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto;">
              ${message}
            </pre>
            <p>Time: ${new Date().toISOString()}</p>
          `,
        });
      }
    },
  },
  level: 'error',
});

// Add to logger transports (only in production):
if (process.env.NODE_ENV === 'production') {
  logger.add(emailTransport);
}
```

## Testing Your Emails

Create a test endpoint (development only):

**File:** `server/routes/test-emails.ts`

```typescript
import { Router } from 'express';
import EmailService from '../services/email';

const router = Router();

// Only enable in development
if (process.env.NODE_ENV !== 'production') {
  router.post('/test/email/welcome', async (req, res) => {
    await EmailService.sendWelcomeEmail(
      req.body.email || 'test@example.com',
      'Test User'
    );
    res.json({ success: true, message: 'Welcome email sent' });
  });

  router.post('/test/email/data-export', async (req, res) => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await EmailService.sendDataExportEmail(
      req.body.email || 'test@example.com',
      'https://example.com/download/123',
      expiresAt
    );
    res.json({ success: true, message: 'Data export email sent' });
  });

  router.post('/test/email/training-complete', async (req, res) => {
    await EmailService.sendTrainingCompleteEmail(
      req.body.email || 'test@example.com',
      'Test Chatbot',
      1234
    );
    res.json({ success: true, message: 'Training complete email sent' });
  });
}

export default router;
```

Add to `server/index.ts`:

```typescript
import testEmailRouter from './routes/test-emails';

if (process.env.NODE_ENV !== 'production') {
  app.use('/api', testEmailRouter);
}
```

Test with curl:

```bash
curl -X POST http://localhost:5000/api/test/email/welcome \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com"}'
```

## Pro Tips

1. **Always test in development first** - Use `onboarding@resend.dev` as sender
2. **Add unsubscribe links** - Required for marketing emails
3. **Monitor delivery** - Check Resend dashboard regularly
4. **Handle failures gracefully** - Don't let email failures block critical operations
5. **Rate limit** - Don't spam users (max 1 email per type per day)
6. **Personalize** - Use user's name, chatbot name, etc.
7. **Mobile-first** - All templates are responsive
8. **Track engagement** - Enable open/click tracking in Resend (optional)

## Need Help?

Check the main setup guide: `EMAIL_SETUP_GUIDE.md`
