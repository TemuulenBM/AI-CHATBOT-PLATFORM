/**
 * GDPR Privacy Policy Controller
 *
 * Manages version-controlled privacy policies
 * GDPR Articles 12-14 (Transparent Information)
 */

import { Request, Response } from 'express';
import { supabaseAdmin } from '../../utils/supabase';
import { z } from 'zod';
import logger from '../../utils/logger';

const createVersionSchema = z.object({
  version: z.string(),
  content: z.string(),
  effectiveDate: z.string(),
});

const updateVersionSchema = z.object({
  content: z.string().optional(),
  effectiveDate: z.string().optional(),
});

/**
 * GET /api/gdpr/privacy-policy
 * Get active privacy policy
 */
export const getActivePrivacyPolicy = async (req: Request, res: Response) => {
  try {
    const { data: policy } = await supabaseAdmin
      .from('privacy_policy_versions')
      .select('id, version, content, effective_date, created_at')
      .eq('is_active', true)
      .single();

    if (!policy) {
      return res.status(404).json({ error: 'No active privacy policy found' });
    }

    res.json(policy);
  } catch (error) {
    logger.error('Failed to get active privacy policy', { error });
    res.status(500).json({ error: 'Failed to get privacy policy' });
  }
};

/**
 * GET /api/gdpr/privacy-policy/versions
 * Get all privacy policy versions
 */
export const getAllVersions = async (req: Request, res: Response) => {
  try {
    const { data: versions } = await supabaseAdmin
      .from('privacy_policy_versions')
      .select('id, version, effective_date, is_active, created_at')
      .order('effective_date', { ascending: false });

    res.json({ versions: versions || [] });
  } catch (error) {
    logger.error('Failed to get privacy policy versions', { error });
    res.status(500).json({ error: 'Failed to get versions' });
  }
};

/**
 * GET /api/gdpr/privacy-policy/:version
 * Get specific privacy policy version
 */
export const getPrivacyPolicyByVersion = async (req: Request, res: Response) => {
  try {
    const { version } = req.params;

    const { data: policy } = await supabaseAdmin
      .from('privacy_policy_versions')
      .select('id, version, content, effective_date, is_active, created_at')
      .eq('version', version)
      .single();

    if (!policy) {
      return res.status(404).json({ error: 'Privacy policy version not found' });
    }

    res.json(policy);
  } catch (error) {
    logger.error('Failed to get privacy policy by version', { error });
    res.status(500).json({ error: 'Failed to get privacy policy' });
  }
};

/**
 * POST /api/gdpr/privacy-policy
 * Create new privacy policy version
 * TODO: Add admin authorization
 */
export const createVersion = async (req: Request, res: Response) => {
  try {
    const { version, content, effectiveDate } = createVersionSchema.parse(req.body);

    // Check if version already exists
    const { data: existing } = await supabaseAdmin
      .from('privacy_policy_versions')
      .select('id')
      .eq('version', version)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Version already exists' });
    }

    // Deactivate current active version if effective date is now or past
    const effectiveDateObj = new Date(effectiveDate);
    if (effectiveDateObj <= new Date()) {
      await supabaseAdmin
        .from('privacy_policy_versions')
        .update({ is_active: false })
        .eq('is_active', true);
    }

    // Create new version
    const { data: newVersion, error } = await supabaseAdmin
      .from('privacy_policy_versions')
      .insert({
        version,
        content,
        effective_date: effectiveDate,
        is_active: effectiveDateObj <= new Date(),
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Privacy policy version created', { version });

    res.status(201).json(newVersion);
  } catch (error) {
    logger.error('Failed to create privacy policy version', { error });
    res.status(500).json({ error: 'Failed to create version' });
  }
};

/**
 * PATCH /api/gdpr/privacy-policy/:version
 * Update privacy policy version (only before effective date)
 * TODO: Add admin authorization
 */
export const updateVersion = async (req: Request, res: Response) => {
  try {
    const { version } = req.params;
    const { content, effectiveDate } = updateVersionSchema.parse(req.body);

    // Get existing version
    const { data: existing } = await supabaseAdmin
      .from('privacy_policy_versions')
      .select('id, effective_date, is_active')
      .eq('version', version)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Can only update if not yet effective
    if (existing.is_active || new Date(existing.effective_date) <= new Date()) {
      return res.status(400).json({
        error: 'Cannot update policy that is already effective',
      });
    }

    // Update version
    const updates: any = {};
    if (content) updates.content = content;
    if (effectiveDate) updates.effective_date = effectiveDate;

    const { data: updated, error } = await supabaseAdmin
      .from('privacy_policy_versions')
      .update(updates)
      .eq('version', version)
      .select()
      .single();

    if (error) throw error;

    logger.info('Privacy policy version updated', { version });

    res.json(updated);
  } catch (error) {
    logger.error('Failed to update privacy policy version', { error });
    res.status(500).json({ error: 'Failed to update version' });
  }
};
