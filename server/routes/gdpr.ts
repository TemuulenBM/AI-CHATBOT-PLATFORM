/**
 * GDPR Compliance Routes
 *
 * Handles all GDPR-related endpoints:
 * - Consent management
 * - Privacy policy
 * - Data export (Subject Access Requests)
 * - Account deletion (Right to Erasure)
 * - Audit logs
 */

import express from 'express';
import { clerkAuthMiddleware, optionalClerkAuthMiddleware } from '../middleware/clerkAuth';

// Import controllers
import * as consentController from '../controllers/gdpr/consent';
import * as privacyPolicyController from '../controllers/gdpr/privacy-policy';
import * as dataExportController from '../controllers/gdpr/data-export';
import * as deletionController from '../controllers/gdpr/deletion';

const router = express.Router();

// ============================================
// CONSENT MANAGEMENT ROUTES
// ============================================

/**
 * POST /api/gdpr/consent
 * Record user consent preferences
 * Can be used by authenticated or anonymous users
 */
router.post('/consent', optionalClerkAuthMiddleware, consentController.recordConsent);

/**
 * GET /api/gdpr/consent
 * Get current consent status
 * Query param: anonymousId (optional for anonymous users)
 */
router.get('/consent', optionalClerkAuthMiddleware, consentController.getConsentStatus);

/**
 * DELETE /api/gdpr/consent
 * Withdraw consent for a specific category
 * Requires authentication
 */
router.delete('/consent', clerkAuthMiddleware, consentController.withdrawConsent);

/**
 * GET /api/gdpr/consent/history
 * Get consent history for current user
 * Requires authentication
 */
router.get('/consent/history', clerkAuthMiddleware, consentController.getConsentHistory);

// ============================================
// PRIVACY POLICY ROUTES
// ============================================

/**
 * GET /api/gdpr/privacy-policy
 * Get active privacy policy
 * Public endpoint
 */
router.get('/privacy-policy', privacyPolicyController.getActivePrivacyPolicy);

/**
 * GET /api/gdpr/privacy-policy/versions
 * Get all privacy policy versions
 * Public endpoint
 */
router.get('/privacy-policy/versions', privacyPolicyController.getAllVersions);

/**
 * GET /api/gdpr/privacy-policy/:version
 * Get specific privacy policy version
 * Public endpoint
 */
router.get('/privacy-policy/:version', privacyPolicyController.getPrivacyPolicyByVersion);

/**
 * POST /api/gdpr/privacy-policy
 * Create new privacy policy version
 * Admin only (TODO: Add admin middleware)
 */
router.post('/privacy-policy', clerkAuthMiddleware, privacyPolicyController.createVersion);

/**
 * PATCH /api/gdpr/privacy-policy/:version
 * Update privacy policy version (only before effective date)
 * Admin only (TODO: Add admin middleware)
 */
router.patch('/privacy-policy/:version', clerkAuthMiddleware, privacyPolicyController.updateVersion);

// ============================================
// DATA SUBJECT RIGHTS ROUTES (Phase 2)
// ============================================

/**
 * GET /api/gdpr/data-export
 * List all data export requests for current user
 * Requires authentication
 */
router.get('/data-export', clerkAuthMiddleware, dataExportController.listExportRequests);

/**
 * POST /api/gdpr/data-export
 * Request a data export (Subject Access Request)
 * Requires authentication
 * Rate limit: 1 request per 24 hours
 */
router.post('/data-export', clerkAuthMiddleware, dataExportController.requestDataExport);

/**
 * GET /api/gdpr/data-export/:requestId/status
 * Check the status of a data export request
 * Requires authentication
 */
router.get('/data-export/:requestId/status', clerkAuthMiddleware, dataExportController.getExportStatus);

/**
 * GET /api/gdpr/data-export/:requestId/download
 * Download completed data export
 * Requires authentication
 * Link expires 7 days after export completion
 */
router.get('/data-export/:requestId/download', clerkAuthMiddleware, dataExportController.downloadExport);

/**
 * GET /api/gdpr/delete-account
 * List all deletion requests for current user
 * Requires authentication
 */
router.get('/delete-account', clerkAuthMiddleware, deletionController.listDeletionRequests);

/**
 * GET /api/gdpr/delete-account/status
 * Get current deletion request status
 * Requires authentication
 */
router.get('/delete-account/status', clerkAuthMiddleware, deletionController.getDeletionStatus);

/**
 * POST /api/gdpr/delete-account
 * Request account deletion with 30-day grace period
 * Requires authentication and email confirmation
 */
router.post('/delete-account', clerkAuthMiddleware, deletionController.requestAccountDeletion);

/**
 * DELETE /api/gdpr/delete-account/:requestId
 * Cancel a pending deletion request (within grace period)
 * Requires authentication
 */
router.delete('/delete-account/:requestId', clerkAuthMiddleware, deletionController.cancelDeletionRequest);

// ============================================
// AUDIT LOG ROUTES (Phase 3)
// ============================================

// These will be implemented in Phase 3:
// - GET /api/gdpr/audit-logs (View own audit logs)
// - GET /api/admin/gdpr/audit-logs (Admin: View all audit logs)

export default router;
