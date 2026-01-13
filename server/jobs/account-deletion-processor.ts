/**
 * GDPR Account Deletion Background Job Processor
 *
 * Processes account deletion requests by:
 * 1. Verifying grace period has passed
 * 2. Deleting user data (cascades automatically)
 * 3. Anonymizing billing records (legal retention requirement)
 * 4. Logging deletion summary
 * 5. Updating request status
 *
 * GDPR Article 17: Right to Erasure ("Right to be Forgotten")
 */

import { Worker, Job } from 'bullmq';
import { supabaseAdmin } from '../utils/supabase';
import logger from '../utils/logger';
import { getRedisConnection } from './queue-connection';
import EmailService from '../services/email';

interface AccountDeletionJobData {
  requestId: string;
}

/**
 * Account Deletion Worker
 * Processes account deletion requests after grace period
 */
export const accountDeletionWorker = new Worker<AccountDeletionJobData>(
  'account-deletion',
  async (job: Job<AccountDeletionJobData>) => {
    const { requestId } = job.data;

    logger.info('Starting account deletion', { requestId });

    try {
      // Get deletion request (include user_email for confirmation)
      const { data: request, error: requestError } = await supabaseAdmin
        .from('deletion_requests')
        .select('user_id, user_email, scheduled_deletion_date, status')
        .eq('id', requestId)
        .single();

      if (requestError || !request) {
        throw new Error('Deletion request not found');
      }

      // Verify status is pending
      if (request.status !== 'pending') {
        logger.info('Deletion request not pending, skipping', {
          requestId,
          status: request.status,
        });
        return { skipped: true, reason: `Status is ${request.status}` };
      }

      // Verify grace period has passed
      const scheduledDate = new Date(request.scheduled_deletion_date);
      if (new Date() < scheduledDate) {
        logger.info('Grace period not yet expired, skipping', {
          requestId,
          scheduledDate,
        });
        return { skipped: true, reason: 'Grace period not expired' };
      }

      const userId = request.user_id;

      // Update status to processing
      await supabaseAdmin
        .from('deletion_requests')
        .update({ status: 'processing' })
        .eq('id', requestId);

      logger.info('Processing account deletion', { userId, requestId });

      // Collect deletion summary before deleting
      const deletionSummary = await collectDeletionSummary(userId);

      try {
        // Anonymize billing records first (7-year legal retention)
        const { data: billingRecords } = await supabaseAdmin
          .from('subscriptions')
          .update({
            user_id: null,
            anonymized_at: new Date().toISOString(),
            anonymized_reason: 'GDPR deletion request',
          })
          .eq('user_id', userId)
          .select('id');

        // Delete user (cascades automatically to chatbots, conversations, etc. via ON DELETE CASCADE)
        const { error: deleteError } = await supabaseAdmin
          .from('users')
          .delete()
          .eq('id', userId);

        if (deleteError) {
          throw deleteError;
        }

        // Update deletion request with completion status
        await supabaseAdmin
          .from('deletion_requests')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            deleted_data: deletionSummary,
            retention_exceptions: {
              billingRecords: billingRecords?.length || 0,
              retentionReason: 'Legal requirement: 7 years for tax/accounting',
            },
          })
          .eq('id', requestId);

        logger.info('Account deletion completed', {
          userId,
          requestId,
          deletionSummary,
          billingRecordsAnonymized: billingRecords?.length || 0,
        });

        // Send GDPR confirmation email (Article 17 compliance)
        if (request.user_email) {
          try {
            await EmailService.sendAccountDeletionCompleted(request.user_email);
            logger.info('Deletion confirmation email sent', {
              requestId,
              email: request.user_email,
            });
          } catch (emailError) {
            // Log email error but don't fail the deletion
            logger.error('Failed to send deletion confirmation email', {
              requestId,
              email: request.user_email,
              error: emailError,
            });
          }
        } else {
          logger.warn('No email stored for deletion confirmation', { requestId });
        }

        return {
          success: true,
          deletionSummary,
          billingRecordsAnonymized: billingRecords?.length || 0,
        };
      } catch (error) {
        throw error;
      }
    } catch (error) {
      logger.error('Account deletion failed', { requestId, error });

      // Update deletion request with failed status
      await supabaseAdmin
        .from('deletion_requests')
        .update({ status: 'failed' })
        .eq('id', requestId);

      throw error;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 1, // Process one deletion at a time for safety
    limiter: {
      max: 5,
      duration: 60000, // Max 5 deletions per minute
    },
  }
);

/**
 * Collect summary of data to be deleted
 */
async function collectDeletionSummary(userId: string) {
  // Count chatbots
  const { count: chatbotCount } = await supabaseAdmin
    .from('chatbots')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Count conversations (via chatbots)
  const { data: chatbots } = await supabaseAdmin
    .from('chatbots')
    .select('id')
    .eq('user_id', userId);

  const chatbotIds = chatbots?.map((c) => c.id) || [];

  let conversationCount = 0;
  let embeddingCount = 0;
  let sessionCount = 0;
  let eventCount = 0;

  if (chatbotIds.length > 0) {
    const { count: convCount } = await supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .in('chatbot_id', chatbotIds);
    conversationCount = convCount || 0;

    const { count: embCount } = await supabaseAdmin
      .from('embeddings')
      .select('*', { count: 'exact', head: true })
      .in('chatbot_id', chatbotIds);
    embeddingCount = embCount || 0;

    const { count: sessCount } = await supabaseAdmin
      .from('widget_sessions')
      .select('*', { count: 'exact', head: true })
      .in('chatbot_id', chatbotIds);
    sessionCount = sessCount || 0;

    const { count: evCount } = await supabaseAdmin
      .from('widget_events')
      .select('*', { count: 'exact', head: true })
      .in('chatbot_id', chatbotIds);
    eventCount = evCount || 0;
  }

  // Count consents
  const { count: consentCount } = await supabaseAdmin
    .from('user_consents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  return {
    chatbots: chatbotCount || 0,
    conversations: conversationCount,
    embeddings: embeddingCount,
    analyticsSessions: sessionCount,
    analyticsEvents: eventCount,
    consents: consentCount || 0,
    deletionDate: new Date().toISOString(),
  };
}

// Event handlers
accountDeletionWorker.on('completed', (job) => {
  logger.info('Account deletion job completed', {
    jobId: job.id,
    result: job.returnvalue,
  });
});

accountDeletionWorker.on('failed', (job, err) => {
  logger.error('Account deletion job failed', {
    jobId: job?.id,
    error: err.message,
  });
});

export default accountDeletionWorker;
