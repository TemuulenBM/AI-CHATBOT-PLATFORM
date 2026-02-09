/**
 * GDPR Consent Management Controller
 *
 * Handles user consent preferences for cookies and data processing
 * GDPR Articles 6 (Lawful Basis), 7 (Consent), 13-14 (Information to be provided)
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/clerkAuth';
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
export const recordConsent = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    // Validate request body
    let parsedBody;
    try {
      parsedBody = consentSchema.parse(req.body);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        logger.warn('Invalid consent request', { errors: validationError.errors });
        return res.status(400).json({ 
          error: 'Invalid request data',
          details: validationError.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        });
      }
      throw validationError;
    }

    const { essential, analytics, marketing, anonymousId } = parsedBody;

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    // Get active privacy policy version
    const { data: policyData, error: policyError } = await supabaseAdmin
      .from('privacy_policy_versions')
      .select('version')
      .eq('is_active', true)
      .single();

    if (policyError && policyError.code !== 'PGRST116') {
      logger.error('Failed to get privacy policy version', { error: policyError });
      return res.status(500).json({ error: 'Failed to retrieve privacy policy version' });
    }

    const currentVersion = policyData?.version || '1.0.0';

    // If user is authenticated, withdraw any previous consents
    if (userId) {
      const { error: withdrawError } = await supabaseAdmin
        .from('user_consents')
        .update({ withdrawn_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('withdrawn_at', null);

      if (withdrawError) {
        logger.error('Failed to withdraw previous consents', { error: withdrawError, userId });
        // Continue anyway - this is not critical
      }
    }

    // Record new consents
    const consents = [
      { type: 'essential', granted: essential },
      { type: 'analytics', granted: analytics },
      { type: 'marketing', granted: marketing },
    ];

    const insertErrors: Array<{ type: string; error: unknown }> = [];
    for (const consent of consents) {
      const { error: insertError } = await supabaseAdmin.from('user_consents').insert({
        user_id: userId || null,
        anonymous_id: !userId ? anonymousId : null,
        consent_type: consent.type,
        granted: consent.granted,
        ip_address: ipAddress,
        user_agent: userAgent,
        consent_version: currentVersion,
        granted_at: new Date().toISOString(),
      });

      if (insertError) {
        insertErrors.push({ type: consent.type, error: insertError });
      }
    }

    if (insertErrors.length > 0) {
      logger.error('Failed to insert some consents', { errors: insertErrors, userId, anonymousId });
      return res.status(500).json({ 
        error: 'Failed to save consent preferences',
        details: 'Some consent records could not be saved'
      });
    }

    logger.info('Consent recorded', { userId, anonymousId, consents });

    res.json({
      success: true,
      message: 'Consent preferences recorded',
      version: currentVersion,
      consents: {
        essential,
        analytics,
        marketing,
      },
    });
  } catch (error) {
    logger.error('Failed to record consent', { error, stack: error instanceof Error ? error.stack : undefined });
    res.status(500).json({ 
      error: 'Failed to record consent',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * GET /api/gdpr/consent
 * Get current consent status
 */
export const getConsentStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
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
    const latestConsents: Record<string, { consent_type: string; granted: boolean; granted_at: string; consent_version: string }> = {};
    consents?.forEach((consent) => {
      if (!latestConsents[consent.consent_type]) {
        latestConsents[consent.consent_type] = consent;
      }
    });

    const consentData = {
      essential: latestConsents.essential?.granted ?? true,
      analytics: latestConsents.analytics?.granted ?? false,
      marketing: latestConsents.marketing?.granted ?? false,
    };

    // Check if user has any consent (hasConsent = true if at least essential is granted)
    const hasConsent = consents && consents.length > 0 && latestConsents.essential?.granted !== false;

    res.json({
      hasConsent,
      consents: consentData,
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
export const withdrawConsent = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
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
export const getConsentHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
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
