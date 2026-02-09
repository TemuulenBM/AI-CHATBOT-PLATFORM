/**
 * Queue Helper Utility
 *
 * Provides a simple interface to add jobs to BullMQ queues
 */

import { dataExportQueue, accountDeletionQueue } from './queues';
import logger from '../utils/logger';

/**
 * Add a job to the appropriate queue
 */
export async function addJob(queueName: string, data: Record<string, unknown>): Promise<void> {
  try {
    switch (queueName) {
      case 'data-export':
        await dataExportQueue.add('process-export', data, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        });
        logger.info('Data export job added to queue', { data });
        break;

      case 'account-deletion':
        await accountDeletionQueue.add('process-deletion', data, {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 10000,
          },
        });
        logger.info('Account deletion job added to queue', { data });
        break;

      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  } catch (error) {
    logger.error('Failed to add job to queue', { queueName, data, error });
    throw error;
  }
}
