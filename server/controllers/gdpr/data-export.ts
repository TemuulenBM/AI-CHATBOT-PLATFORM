/**
 * GDPR Data Export Controller
 *
 * Handles Subject Access Requests (SAR)
 * GDPR Articles 15 (Right of Access) & 20 (Data Portability)
 */

import { Request, Response } from 'express';
import { supabaseAdmin } from '../../utils/supabase';
import { z } from 'zod';
import logger from '../../utils/logger';
import { addJob } from '../../jobs/queue';
import { createReadStream, existsSync } from 'fs';

const requestExportSchema = z.object({
  format: z.enum(['json']).default('json'),
});

/**
 * GET /api/gdpr/data-export
 * List all data export requests for current user
 */
export const listExportRequests = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data: exports } = await supabaseAdmin
      .from('data_export_requests')
      .select('id, status, export_format, created_at, completed_at, expires_at, file_size_bytes')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const formattedExports = exports?.map((exp) => ({
      requestId: exp.id,
      status: exp.status,
      format: exp.export_format,
      requestDate: exp.created_at,
      completedAt: exp.completed_at,
      expiresAt: exp.expires_at,
      fileSizeMB: exp.file_size_bytes
        ? (exp.file_size_bytes / (1024 * 1024)).toFixed(2)
        : null,
      canDownload: exp.status === 'completed' && exp.expires_at && new Date(exp.expires_at) > new Date(),
    }));

    res.json({ exports: formattedExports || [] });
  } catch (error) {
    logger.error('Failed to list export requests', { error });
    res.status(500).json({ error: 'Failed to list exports' });
  }
};

/**
 * POST /api/gdpr/data-export
 * Request a data export (Subject Access Request)
 * Rate limit: 1 request per 24 hours
 */
export const requestDataExport = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { format } = requestExportSchema.parse(req.body);

    // Check rate limit: 1 export per 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { data: recent } = await supabaseAdmin
      .from('data_export_requests')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', twentyFourHoursAgo.toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      return res.status(429).json({
        error: 'Rate limit exceeded. You can request 1 export per 24 hours.',
      });
    }

    // Create export request
    const { data: request, error } = await supabaseAdmin
      .from('data_export_requests')
      .insert({
        user_id: userId,
        status: 'pending',
        export_format: format,
      })
      .select()
      .single();

    if (error) throw error;

    // Queue background job
    await addJob('data-export', {
      requestId: request.id,
      userId,
      format,
    });

    logger.info('Data export requested', { userId, requestId: request.id });

    res.status(202).json({
      requestId: request.id,
      status: 'pending',
      message: 'Export request queued. You will be able to download it within 24 hours.',
    });
  } catch (error) {
    logger.error('Failed to request data export', { error });
    res.status(500).json({ error: 'Failed to request export' });
  }
};

/**
 * GET /api/gdpr/data-export/:requestId/status
 * Check the status of a data export request
 */
export const getExportStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { requestId } = req.params;

    const { data: request } = await supabaseAdmin
      .from('data_export_requests')
      .select('id, status, export_format, created_at, completed_at, expires_at, file_size_bytes, error_message')
      .eq('id', requestId)
      .eq('user_id', userId)
      .single();

    if (!request) {
      return res.status(404).json({ error: 'Export request not found' });
    }

    res.json({
      requestId: request.id,
      status: request.status,
      format: request.export_format,
      requestDate: request.created_at,
      completedAt: request.completed_at,
      expiresAt: request.expires_at,
      fileSizeMB: request.file_size_bytes
        ? (request.file_size_bytes / (1024 * 1024)).toFixed(2)
        : null,
      canDownload: request.status === 'completed' && request.expires_at && new Date(request.expires_at) > new Date(),
      errorMessage: request.error_message,
    });
  } catch (error) {
    logger.error('Failed to get export status', { error });
    res.status(500).json({ error: 'Failed to get status' });
  }
};

/**
 * GET /api/gdpr/data-export/:requestId/download
 * Download completed data export
 * Link expires 7 days after export completion
 */
export const downloadExport = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { requestId } = req.params;

    const { data: request } = await supabaseAdmin
      .from('data_export_requests')
      .select('id, status, file_path, expires_at')
      .eq('id', requestId)
      .eq('user_id', userId)
      .single();

    if (!request) {
      return res.status(404).json({ error: 'Export request not found' });
    }

    if (request.status !== 'completed') {
      return res.status(400).json({
        error: 'Export is not ready for download',
        status: request.status,
      });
    }

    if (!request.expires_at || new Date(request.expires_at) <= new Date()) {
      return res.status(410).json({
        error: 'Export has expired. Please request a new export.',
      });
    }

    if (!request.file_path || !existsSync(request.file_path)) {
      return res.status(404).json({
        error: 'Export file not found',
      });
    }

    // Stream the file
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="convoai-data-export-${requestId}.zip"`);

    const fileStream = createReadStream(request.file_path);
    fileStream.pipe(res);

    logger.info('Data export downloaded', { userId, requestId });
  } catch (error) {
    logger.error('Failed to download export', { error });
    res.status(500).json({ error: 'Failed to download export' });
  }
};
