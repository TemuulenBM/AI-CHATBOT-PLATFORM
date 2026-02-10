/**
 * GDPR Account Deletion Scheduler
 *
 * Cron job that runs daily at 3 AM UTC to check for deletion requests
 * that have passed their grace period and need to be processed.
 *
 * Features:
 * - Queries for pending deletions past scheduled date
 * - Queues deletion jobs for processing
 * - Prevents duplicate processing
 */

import { Worker, Job, Queue } from 'bullmq';
import { supabaseAdmin } from '../utils/supabase';
import logger from '../utils/logger';
import { getRedisConnection } from './queue-connection';
import { addJob } from './queue';

const connection = getRedisConnection();

// Scheduled Deletion Check Queue
export const scheduledDeletionQueue = new Queue('scheduled-deletion-check', {
  connection,
});

interface ScheduledDeletionCheckJobData {
  // Empty - job fetches pending deletions
}

/**
 * Scheduled Deletion Check Worker
 * Runs daily at 3 AM to check for deletions that need processing
 */
export const scheduledDeletionWorker = new Worker<ScheduledDeletionCheckJobData>(
  'scheduled-deletion-check',
  async (job: Job<ScheduledDeletionCheckJobData>) => {
    logger.info('Starting scheduled deletion check', { jobId: job.id });

    try {
      // Find all pending deletion requests past their scheduled date
      const { data: requests, error } = await supabaseAdmin
        .from('deletion_requests')
        .select('id, user_id, scheduled_deletion_date')
        .eq('status', 'pending')
        .lte('scheduled_deletion_date', new Date().toISOString())
        .order('scheduled_deletion_date', { ascending: true });

      if (error) {
        logger.error('Failed to fetch pending deletions', { error });
        throw error;
      }

      if (!requests || requests.length === 0) {
        logger.info('No pending deletions found');
        return { processed: 0, message: 'No pending deletions' };
      }

      logger.info('Found pending deletions', { count: requests.length });

      let queuedCount = 0;

      for (const request of requests) {
        try {
          // Queue deletion job
          await addJob('account-deletion', {
            requestId: request.id,
          });

          queuedCount++;

          logger.info('Deletion job queued', {
            requestId: request.id,
            userId: request.user_id,
            scheduledDate: request.scheduled_deletion_date,
          });
        } catch (error) {
          logger.error('Failed to queue deletion job', {
            requestId: request.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      logger.info('Scheduled deletion check completed', {
        totalPending: requests.length,
        queuedForDeletion: queuedCount,
      });

      return {
        processed: queuedCount,
        totalFound: requests.length,
        message: `Queued ${queuedCount} out of ${requests.length} pending deletions`,
      };
    } catch (error) {
      logger.error('Scheduled deletion check failed', { error });
      throw error;
    }
  },
  {
    connection,
    concurrency: 1, // Only one check at a time
    drainDelay: 60_000, // Cron job — өдөрт 1 удаа тул 60s poll хангалттай
  }
);

/**
 * Initialize the scheduled deletion cron job
 * Runs daily at 3 AM UTC
 */
export async function initScheduledDeletion(): Promise<void> {
  try {
    // Remove any existing repeatable jobs to avoid duplicates
    const existingJobs = await scheduledDeletionQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      await scheduledDeletionQueue.removeRepeatableByKey(job.key);
    }

    // Add the repeatable job
    await scheduledDeletionQueue.add(
      'check-scheduled-deletions',
      {},
      {
        repeat: {
          pattern: '0 3 * * *', // 3 AM daily (after data export cleanup at 2 AM)
        },
      }
    );

    logger.info('Scheduled deletion cron job initialized (runs daily at 3 AM UTC)');
  } catch (error) {
    logger.error('Failed to initialize scheduled deletion cron job', { error });
    throw error;
  }
}

// Event handlers
scheduledDeletionWorker.on('completed', (job) => {
  logger.info('Scheduled deletion check completed', {
    jobId: job.id,
    result: job.returnvalue,
  });
});

scheduledDeletionWorker.on('failed', (job, err) => {
  logger.error('Scheduled deletion check failed', {
    jobId: job?.id,
    error: err.message,
  });
});

// Error handler
scheduledDeletionQueue.on('error', (err: Error) => {
  if (err.message && err.message.includes('max requests limit exceeded')) {
    logger.debug('Redis quota limit reached for scheduled deletion queue');
    return;
  }
  logger.error('Scheduled deletion queue error', { error: err.message });
});

export default scheduledDeletionWorker;
