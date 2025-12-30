/**
 * GDPR Consent Management Controller
 *
 * Handles user consent preferences for cookies and data processing
 * GDPR Articles 6 (Lawful Basis), 7 (Consent), 13-14 (Information to be provided)
 */

import { Request, Response } from 'express';
import { supabaseAdmin } from '../../utils/supabase';
import { z } from 'zod';
import logger from '../../utils/logger';

// Validation schemas
const consentSchema = z.object({
  essential: z.boolean(),
  analytics: z.boolean(),
  marketing: z.boolean(),
  anonymousId: z.string().optional(),
});

const withdrawSchema = z.object({
  consentType: z.enum(['analytics', 'marketing']),
});

/**
 * POST /api/gdpr/consent
 * Record user consent preferences
 */
export const recordConsent = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    const { essential, analytics, marketing, anonymousId } = consentSchema.parse(req.body);

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    // Get active privacy policy version
    const { data: policyData } = await supabaseAdmin
      .from('privacy_policy_versions')
      .select('version')
      .eq('is_active', true)
      .single();

    const currentVersion = policyData?.version || '1.0.0';

    // If user is authenticated, withdraw any previous consents
    if (userId) {
      await supabaseAdmin
        .from('user_consents')
        .update({ withdrawn_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('withdrawn_at', null);
    }

    // Record new consents
    const consents = [
      { type: 'essential', granted: essential },
      { type: 'analytics', granted: analytics },
      { type: 'marketing', granted: marketing },
    ];

    for (const consent of consents) {
      await supabaseAdmin.from('user_consents').insert({
        user_id: userId || null,
        anonymous_id: !userId ? anonymousId : null,
        consent_type: consent.type,
        granted: consent.granted,
        ip_address: ipAddress,
        user_agent: userAgent,
        consent_version: currentVersion,
        granted_at: new Date().toISOString(),
      });
    }

    logger.info('Consent recorded', { userId, anonymousId, consents });

    res.json({
      success: true,
      message: 'Consent preferences recorded',
      version: currentVersion,
    });
  } catch (error) {
    logger.error('Failed to record consent', { error });
    res.status(500).json({ error: 'Failed to record consent' });
  }
};

/**
 * GET /api/gdpr/consent
 * Get current consent status
 */
export const getConsentStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    const anonymousId = req.query.anonymousId as string;

    if (!userId && !anonymousId) {
      return res.status(400).json({ error: 'User ID or anonymous ID required' });
    }

    let query = supabaseAdmin
      .from('user_consents')
      .select('consent_type, granted, granted_at, consent_version')
      .is('withdrawn_at', null)
      .order('granted_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.eq('anonymous_id', anonymousId);
    }

    const { data: consents } = await query;

    // Get latest consent for each type
    const latestConsents: Record<string, any> = {};
    consents?.forEach((consent) => {
      if (!latestConsents[consent.consent_type]) {
        latestConsents[consent.consent_type] = consent;
      }
    });

    res.json({
      consents: {
        essential: latestConsents.essential?.granted ?? true,
        analytics: latestConsents.analytics?.granted ?? false,
        marketing: latestConsents.marketing?.granted ?? false,
      },
      version: latestConsents.essential?.consent_version || '1.0.0',
    });
  } catch (error) {
    logger.error('Failed to get consent status', { error });
    res.status(500).json({ error: 'Failed to get consent status' });
  }
};

/**
 * DELETE /api/gdpr/consent
 * Withdraw consent for a specific category
 */
export const withdrawConsent = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { consentType } = withdrawSchema.parse(req.body);

    await supabaseAdmin
      .from('user_consents')
      .update({ withdrawn_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('consent_type', consentType)
      .is('withdrawn_at', null);

    logger.info('Consent withdrawn', { userId, consentType });

    res.json({
      success: true,
      message: `${consentType} consent withdrawn`,
    });
  } catch (error) {
    logger.error('Failed to withdraw consent', { error });
    res.status(500).json({ error: 'Failed to withdraw consent' });
  }
};

/**
 * GET /api/gdpr/consent/history
 * Get consent history for current user
 */
export const getConsentHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data: history } = await supabaseAdmin
      .from('user_consents')
      .select('consent_type, granted, granted_at, withdrawn_at, consent_version, ip_address')
      .eq('user_id', userId)
      .order('granted_at', { ascending: false });

    res.json({
      history: history || [],
    });
  } catch (error) {
    logger.error('Failed to get consent history', { error });
    res.status(500).json({ error: 'Failed to get consent history' });
  }
};
