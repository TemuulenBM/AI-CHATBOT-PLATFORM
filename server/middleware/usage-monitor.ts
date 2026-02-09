import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin, PLAN_LIMITS } from '../utils/supabase';
import EmailService from '../services/email';
import logger from '../utils/logger';
import { redis } from '../utils/redis';

interface UsageWarning {
  userId: string;
  threshold: number;
  resourceType: string;
  lastSent: number;
}

/**
 * Check if usage warning was recently sent (within last 24 hours)
 */
async function wasRecentlySent(userId: string, threshold: number, resourceType: string): Promise<boolean> {
  try {
    const cacheKey = `usage-warning:${userId}:${resourceType}:${threshold}`;
    const lastSent = await redis.get(cacheKey);

    if (lastSent) {
      const lastSentTime = parseInt(lastSent);
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      return lastSentTime > dayAgo;
    }

    return false;
  } catch (error) {
    logger.error('Failed to check usage warning cache', { error, userId });
    return false; // On error, allow sending (fail open)
  }
}

/**
 * Mark usage warning as sent
 */
async function markWarningSent(userId: string, threshold: number, resourceType: string): Promise<void> {
  try {
    const cacheKey = `usage-warning:${userId}:${resourceType}:${threshold}`;
    // Store timestamp for 25 hours (to prevent spam even if job runs slightly early)
    await redis.setex(cacheKey, 25 * 60 * 60, Date.now().toString());
  } catch (error) {
    logger.error('Failed to cache usage warning', { error, userId });
  }
}

/**
 * Check usage limits and send warning emails
 * This middleware checks message usage and sends warnings at 80%, 90%, 100%
 */
export async function checkUsageLimits(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = (req as Request & { auth?: { userId?: string } }).auth?.userId;

    // Skip if no user (public endpoints)
    if (!userId) {
      next();
      return;
    }

    // Get user's subscription and usage
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, usage')
      .eq('user_id', userId)
      .single();

    if (!subscription) {
      next();
      return;
    }

    const plan = subscription.plan || 'free';
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    const usage = subscription.usage || { messages_count: 0, chatbots_count: 0 };

    // Check message usage
    const messagesLimit = limits.messages;
    const messagesUsed = usage.messages_count || 0;
    const messagesPercent = (messagesUsed / messagesLimit) * 100;

    // Send warning at 80%, 90%, 100%
    const thresholds = [80, 90, 100];

    for (const threshold of thresholds) {
      if (messagesPercent >= threshold) {
        // Check if we already sent this warning recently
        const recentlySent = await wasRecentlySent(userId, threshold, 'messages');

        if (!recentlySent) {
          // Get user email
          const { data: user } = await supabaseAdmin
            .from('users')
            .select('email')
            .eq('id', userId)
            .single();

          if (user?.email) {
            await EmailService.sendUsageLimitWarning(
              user.email,
              messagesUsed,
              messagesLimit,
              'messages'
            );

            await markWarningSent(userId, threshold, 'messages');

            logger.info('Usage limit warning sent', {
              userId,
              email: user.email,
              threshold,
              resourceType: 'messages',
              currentUsage: messagesUsed,
              limit: messagesLimit,
            });
          }
        }

        // Only send one warning (highest threshold reached)
        break;
      }
    }

    // Check chatbot usage
    const chatbotsLimit = limits.chatbots;
    const chatbotsUsed = usage.chatbots_count || 0;
    const chatbotsPercent = (chatbotsUsed / chatbotsLimit) * 100;

    // Only warn at 100% for chatbots (since it's a hard limit)
    if (chatbotsPercent >= 100) {
      const recentlySent = await wasRecentlySent(userId, 100, 'chatbots');

      if (!recentlySent) {
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('email')
          .eq('id', userId)
          .single();

        if (user?.email) {
          await EmailService.sendUsageLimitWarning(
            user.email,
            chatbotsUsed,
            chatbotsLimit,
            'chatbots'
          );

          await markWarningSent(userId, 100, 'chatbots');

          logger.info('Chatbot limit warning sent', {
            userId,
            email: user.email,
            threshold: 100,
            resourceType: 'chatbots',
            currentUsage: chatbotsUsed,
            limit: chatbotsLimit,
          });
        }
      }
    }

    next();
  } catch (error) {
    // Don't block the request if usage check fails
    logger.error('Usage check failed', { error });
    next();
  }
}

/**
 * Background job to check usage limits for all users
 * This runs periodically to catch users approaching limits
 */
export async function checkAllUsersLimits(): Promise<void> {
  try {
    logger.info('Starting periodic usage limit check for all users');

    // Get all subscriptions
    const { data: subscriptions, error } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, plan, usage');

    if (error || !subscriptions) {
      logger.error('Failed to fetch subscriptions for usage check', { error });
      return;
    }

    let warningsSent = 0;

    for (const subscription of subscriptions) {
      const { user_id: userId, plan, usage } = subscription;

      if (!userId || !plan || !usage) continue;

      const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
      const messagesLimit = limits.messages;
      const messagesUsed = usage.messages_count || 0;
      const messagesPercent = (messagesUsed / messagesLimit) * 100;

      // Check for warnings to send
      const thresholds = [80, 90, 100];

      for (const threshold of thresholds) {
        if (messagesPercent >= threshold) {
          const recentlySent = await wasRecentlySent(userId, threshold, 'messages');

          if (!recentlySent) {
            const { data: user } = await supabaseAdmin
              .from('users')
              .select('email')
              .eq('id', userId)
              .single();

            if (user?.email) {
              await EmailService.sendUsageLimitWarning(
                user.email,
                messagesUsed,
                messagesLimit,
                'messages'
              );

              await markWarningSent(userId, threshold, 'messages');
              warningsSent++;

              logger.info('Periodic usage warning sent', {
                userId,
                threshold,
                messagesUsed,
                messagesLimit,
              });
            }
          }
          break;
        }
      }

      // Small delay to avoid overwhelming email service
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('Periodic usage limit check completed', { warningsSent });
  } catch (error) {
    logger.error('Periodic usage limit check failed', { error });
  }
}

export default { checkUsageLimits, checkAllUsersLimits };
