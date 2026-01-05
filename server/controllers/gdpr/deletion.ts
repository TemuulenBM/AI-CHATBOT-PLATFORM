/**
 * GDPR Account Deletion Controller
 *
 * Handles account deletion requests with 30-day grace period
 * GDPR Article 17: Right to Erasure ("Right to be Forgotten")
 */

import { Request, Response } from 'express';
import { supabaseAdmin } from '../../utils/supabase';
import { z } from 'zod';
import logger from '../../utils/logger';
import EmailService from '../../services/email';

const requestDeletionSchema = z.object({
  confirmEmail: z.string().email(),
  reason: z.string().optional(),
});

/**
 * GET /api/gdpr/delete-account
 * List all deletion requests for current user
 */
export const listDeletionRequests = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data: requests } = await supabaseAdmin
      .from('deletion_requests')
      .select('id, status, reason, request_date, scheduled_deletion_date, completed_at')
      .eq('user_id', userId)
      .order('request_date', { ascending: false });

    const formattedRequests = requests?.map((req) => ({
      id: req.id,
      status: req.status,
      reason: req.reason,
      requestedAt: req.request_date,
      scheduledDeletionDate: req.scheduled_deletion_date,
      completedAt: req.completed_at,
      canCancel: req.status === 'pending' && new Date(req.scheduled_deletion_date) > new Date(),
    }));

    res.json({ requests: formattedRequests || [] });
  } catch (error) {
    logger.error('Failed to list deletion requests', { error });
    res.status(500).json({ error: 'Failed to list requests' });
  }
};

/**
 * GET /api/gdpr/delete-account/status
 * Get current deletion request status
 */
export const getDeletionStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get most recent pending deletion request
    const { data: request } = await supabaseAdmin
      .from('deletion_requests')
      .select('id, status, reason, request_date, scheduled_deletion_date, completed_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('request_date', { ascending: false })
      .limit(1)
      .single();

    if (!request) {
      return res.json({ request: null });
    }

    res.json({
      request: {
        id: request.id,
        status: request.status,
        reason: request.reason,
        requestedAt: request.request_date,
        scheduledDeletionDate: request.scheduled_deletion_date,
        completedAt: request.completed_at,
        canCancel: request.status === 'pending' && new Date(request.scheduled_deletion_date) > new Date(),
      },
    });
  } catch (error) {
    logger.error('Failed to get deletion status', { error });
    res.status(500).json({ error: 'Failed to get status' });
  }
};

/**
 * POST /api/gdpr/delete-account
 * Request account deletion with 30-day grace period
 */
export const requestAccountDeletion = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { confirmEmail, reason } = requestDeletionSchema.parse(req.body);

    // Get user's email from database
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify email matches
    if (user.email.toLowerCase() !== confirmEmail.toLowerCase()) {
      return res.status(400).json({
        error: 'Email confirmation does not match your account email',
      });
    }

    // Check if there's already a pending deletion request
    const { data: existing } = await supabaseAdmin
      .from('deletion_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return res.status(400).json({
        error: 'You already have a pending deletion request',
      });
    }

    // Schedule deletion for 30 days from now
    const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Create deletion request
    const { data: request, error } = await supabaseAdmin
      .from('deletion_requests')
      .insert({
        user_id: userId,
        reason: reason || null,
        status: 'pending',
        request_date: new Date().toISOString(),
        scheduled_deletion_date: scheduledDate.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Account deletion requested', {
      userId,
      requestId: request.id,
      scheduledDate,
    });

    // Send confirmation email
    await EmailService.sendAccountDeletionConfirmation(user.email, user.email.split('@')[0], scheduledDate);

    res.status(202).json({
      requestId: request.id,
      status: 'pending',
      scheduledDeletionDate: scheduledDate.toISOString(),
      message: 'Account deletion scheduled for 30 days from now. You can cancel this at any time before then.',
    });
  } catch (error) {
    logger.error('Failed to request account deletion', { error });
    res.status(500).json({ error: 'Failed to request deletion' });
  }
};

/**
 * DELETE /api/gdpr/delete-account/:requestId
 * Cancel a pending deletion request (within grace period)
 */
export const cancelDeletionRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { requestId } = req.params;

    // Get deletion request
    const { data: request } = await supabaseAdmin
      .from('deletion_requests')
      .select('id, status, scheduled_deletion_date')
      .eq('id', requestId)
      .eq('user_id', userId)
      .single();

    if (!request) {
      return res.status(404).json({ error: 'Deletion request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        error: 'Can only cancel pending deletion requests',
        status: request.status,
      });
    }

    if (new Date(request.scheduled_deletion_date) <= new Date()) {
      return res.status(400).json({
        error: 'Grace period has expired. Deletion cannot be cancelled.',
      });
    }

    // Cancel the request by updating status to cancelled
    await supabaseAdmin
      .from('deletion_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId);

    logger.info('Account deletion cancelled', { userId, requestId });

    res.json({
      success: true,
      message: 'Deletion request cancelled successfully',
    });
  } catch (error) {
    logger.error('Failed to cancel deletion request', { error });
    res.status(500).json({ error: 'Failed to cancel request' });
  }
};
