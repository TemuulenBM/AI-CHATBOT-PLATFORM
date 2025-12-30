# GDPR Compliance Implementation Plan
## ConvoAI Enterprise AI Chatbot Platform

**Document Version:** 1.0
**Date:** 2025-12-30
**Status:** Planning Phase
**Estimated Timeline:** 8-12 weeks for full implementation

---

## Executive Summary

This plan outlines the implementation of enterprise-grade GDPR compliance features for ConvoAI. The platform currently has strong security foundations (Clerk authentication, CSRF protection, data encryption, cascading deletion) but lacks explicit GDPR-mandated features such as data subject access requests, consent management, and privacy documentation.

**Key Compliance Gaps:**
- ❌ No data export (Subject Access Request) functionality
- ❌ No cookie consent management system
- ❌ No privacy policy acceptance workflow
- ❌ Limited audit trail for data access/modifications
- ❌ No granular consent management for marketing/analytics
- ❌ Missing data processing documentation
- ❌ No automated privacy impact assessments

**Existing Strengths:**
- ✅ Cascading user deletion (right to erasure foundation)
- ✅ Data retention policies (90-day events, 1-year sessions)
- ✅ Strong authentication (Clerk + JWT)
- ✅ CSRF protection and security headers
- ✅ Encrypted data transmission (HTTPS, TLS Redis)
- ✅ Row-level security in database
- ✅ Structured logging with Winston

---

## Table of Contents

1. [GDPR Requirements Mapping](#gdpr-requirements-mapping)
2. [Implementation Architecture](#implementation-architecture)
3. [Phase 1: Foundation & Consent Management](#phase-1-foundation--consent-management)
4. [Phase 2: Data Subject Rights](#phase-2-data-subject-rights)
5. [Phase 3: Audit & Compliance](#phase-3-audit--compliance)
6. [Phase 4: Documentation & Monitoring](#phase-4-documentation--monitoring)
7. [Database Schema Changes](#database-schema-changes)
8. [API Endpoints Specification](#api-endpoints-specification)
9. [Frontend Components](#frontend-components)
10. [Security Considerations](#security-considerations)
11. [Testing Strategy](#testing-strategy)
12. [Deployment Plan](#deployment-plan)
13. [Maintenance & Monitoring](#maintenance--monitoring)

---

## GDPR Requirements Mapping

### Article 6 - Lawfulness of Processing
**Requirement:** Legal basis for processing personal data

**Implementation:**
- Consent management system for analytics, marketing cookies
- Legitimate interest documentation for essential services
- Contract basis for subscription/billing data
- Privacy policy with clear legal bases outlined

**Priority:** HIGH | **Phase:** 1

---

### Article 7 - Conditions for Consent
**Requirement:** Clear, affirmative, specific, informed, and freely given consent

**Implementation:**
- Granular consent checkboxes (not pre-checked)
- Cookie consent banner with category selection
- Consent withdrawal mechanism
- Proof of consent storage with timestamp

**Priority:** HIGH | **Phase:** 1

---

### Article 12-14 - Transparency
**Requirement:** Provide clear information about data processing

**Implementation:**
- Privacy notice generator
- Data processing inventory
- Privacy policy page (auto-updated from inventory)
- Clear retention period display
- Third-party processor disclosure (OpenAI, Clerk, Paddle, Upstash)

**Priority:** HIGH | **Phase:** 1

---

### Article 15 - Right of Access (Subject Access Request)
**Requirement:** Individuals can request a copy of their personal data

**Implementation:**
- `/api/gdpr/data-export` endpoint
- Export format: JSON + human-readable HTML
- Include all data:
  - User profile
  - Chatbot configurations
  - Conversation histories
  - Analytics data (sessions, events)
  - Subscription/billing info
  - Consent records
- Maximum response time: 30 days (target: instant for automated exports)

**Priority:** CRITICAL | **Phase:** 2

---

### Article 16 - Right to Rectification
**Requirement:** Individuals can correct inaccurate data

**Implementation:**
- User settings page (already exists: `/dashboard/settings`)
- API endpoint for profile updates
- Audit log for all corrections
- Email change workflow with verification

**Priority:** MEDIUM | **Phase:** 2 (Enhancement)

---

### Article 17 - Right to Erasure ("Right to be Forgotten")
**Requirement:** Individuals can request deletion of their data

**Implementation:**
- Enhanced `/api/gdpr/delete-account` endpoint
- Two-tier deletion:
  - **Immediate**: User account, chatbots, conversations, API keys
  - **Scheduled** (30 days): Backups, audit logs (legal retention)
- Deletion confirmation email
- Retention exceptions for legal/billing obligations (7 years for invoices)
- Audit trail of deletion requests

**Priority:** CRITICAL | **Phase:** 2

---

### Article 18 - Right to Restriction of Processing
**Requirement:** Individuals can limit how their data is processed

**Implementation:**
- Account suspension (restrict processing but retain data)
- Opt-out of analytics tracking
- Opt-out of marketing communications
- Data "freeze" mode (visible but not processed)

**Priority:** MEDIUM | **Phase:** 3

---

### Article 20 - Right to Data Portability
**Requirement:** Receive personal data in machine-readable format

**Implementation:**
- Export in JSON (machine-readable) + CSV for tabular data
- Structured schema documentation
- Compatible with industry standards
- Direct transfer to another service (if applicable)

**Priority:** HIGH | **Phase:** 2

---

### Article 25 - Data Protection by Design and by Default
**Requirement:** Privacy built into system design

**Implementation:**
- Pseudonymization for analytics (IP anonymization)
- Minimal data collection principle
- Encryption at rest (database-level)
- Privacy impact assessment (PIA) template
- Regular privacy reviews

**Priority:** MEDIUM | **Phase:** 3

---

### Article 30 - Records of Processing Activities
**Requirement:** Maintain documentation of all processing activities

**Implementation:**
- Data processing inventory table
- Processing activity record (ROPA) generator
- Categories of data tracked:
  - Identity data (name, email)
  - Contact data (email)
  - Usage data (chatbot interactions)
  - Technical data (IP, device type)
  - Billing data (Paddle customer ID)
- Purpose documentation
- Retention period specification

**Priority:** HIGH | **Phase:** 4

---

### Article 32 - Security of Processing
**Requirement:** Implement appropriate technical and organizational measures

**Implementation:**
- Already strong: HTTPS, CSRF, Helmet, RLS, bcrypt
- Enhancements:
  - Database encryption at rest (Supabase feature)
  - Regular security audits
  - Penetration testing
  - Incident response plan
  - Data breach notification system (<72 hours)

**Priority:** MEDIUM | **Phase:** 3

---

### Article 33-34 - Data Breach Notification
**Requirement:** Notify authorities and users within 72 hours

**Implementation:**
- Breach detection monitoring (Sentry + custom alerts)
- Automated notification pipeline
- Breach register (log all incidents)
- Email templates for user notification
- DPA (Data Protection Authority) contact workflow

**Priority:** MEDIUM | **Phase:** 4

---

### Article 35 - Data Protection Impact Assessment (DPIA)
**Requirement:** Conduct DPIAs for high-risk processing

**Implementation:**
- DPIA template and workflow
- Trigger conditions (AI processing, large-scale analytics)
- Risk assessment matrix
- Mitigation strategy documentation

**Priority:** LOW | **Phase:** 4

---

## Implementation Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────┐
│                     GDPR Compliance Layer                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Consent    │  │  Data Subject│  │    Audit     │      │
│  │  Management  │  │    Rights    │  │     Trail    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Privacy    │  │  Data Export │  │   Deletion   │      │
│  │    Policy    │  │    (SAR)     │  │    Engine    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Existing Application Layer                 │
├─────────────────────────────────────────────────────────────┤
│  Authentication (Clerk) │ API Routes │ Business Logic       │
│  Database (Supabase)    │ Redis Cache│ Background Jobs      │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack Additions

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Cookie Consent | Custom + Cookie library | GDPR-compliant consent management |
| Data Export | Node.js streams + Archiver | Large dataset export (ZIP) |
| Audit Logging | Winston + PostgreSQL | Immutable audit trail |
| Privacy Docs | Markdown + React | Dynamic privacy policy |
| Email Notifications | Existing system | Consent confirmations, breach alerts |
| Job Queue | BullMQ (existing) | Async data deletion, export |

---

## Phase 1: Foundation & Consent Management

**Duration:** 2-3 weeks
**Priority:** HIGH - Legal requirement for cookie usage

### 1.1 Cookie Consent System

#### Database Schema

```sql
-- New table: user_consents
CREATE TABLE user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id VARCHAR(255), -- For non-logged-in users
  consent_type VARCHAR(50) NOT NULL, -- 'essential', 'analytics', 'marketing'
  granted BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,
  consent_version VARCHAR(20) NOT NULL, -- Privacy policy version
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ,

  -- Ensure unique active consent per type
  CONSTRAINT unique_active_consent UNIQUE (user_id, consent_type, withdrawn_at)
);

CREATE INDEX idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX idx_user_consents_anonymous_id ON user_consents(anonymous_id);
CREATE INDEX idx_user_consents_granted_at ON user_consents(granted_at);

-- New table: privacy_policy_versions
CREATE TABLE privacy_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) UNIQUE NOT NULL, -- e.g., "1.0.0"
  content TEXT NOT NULL, -- Markdown content
  effective_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN DEFAULT false
);

CREATE INDEX idx_privacy_policy_active ON privacy_policy_versions(is_active);
```

#### Backend Implementation

**Files to Create:**

1. `/server/controllers/gdpr/consent.ts`
```typescript
/**
 * GDPR Consent Management Controller
 *
 * Handles:
 * - Recording user consent for different data processing categories
 * - Withdrawing consent
 * - Querying consent status
 * - Consent proof generation
 */

import { Request, Response } from 'express';
import { db } from '../../utils/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const consentSchema = z.object({
  essential: z.boolean().default(true), // Always required
  analytics: z.boolean(),
  marketing: z.boolean(),
  anonymousId: z.string().optional(), // For non-authenticated users
});

export const recordConsent = async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.userId; // From Clerk
    const { essential, analytics, marketing, anonymousId } = consentSchema.parse(req.body);

    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');
    const currentVersion = await getActivePrivacyPolicyVersion();

    // Record each consent type
    const consentTypes = [
      { type: 'essential', granted: essential },
      { type: 'analytics', granted: analytics },
      { type: 'marketing', granted: marketing },
    ];

    const consents = await Promise.all(
      consentTypes.map(({ type, granted }) =>
        db.query(
          `INSERT INTO user_consents
           (user_id, anonymous_id, consent_type, granted, ip_address, user_agent, consent_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [userId || null, anonymousId || null, type, granted, ipAddress, userAgent, currentVersion]
        )
      )
    );

    logger.info('Consent recorded', { userId, anonymousId, consents });

    res.json({
      success: true,
      message: 'Consent preferences saved',
      consents: consents.map(c => c.rows[0])
    });
  } catch (error) {
    logger.error('Error recording consent', { error });
    res.status(500).json({ error: 'Failed to record consent' });
  }
};

export const getConsentStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.userId;
    const { anonymousId } = req.query;

    const { rows } = await db.query(
      `SELECT consent_type, granted, granted_at, consent_version
       FROM user_consents
       WHERE (user_id = $1 OR anonymous_id = $2)
         AND withdrawn_at IS NULL
       ORDER BY granted_at DESC`,
      [userId || null, anonymousId || null]
    );

    // Convert to object format
    const consents = rows.reduce((acc, row) => {
      acc[row.consent_type] = {
        granted: row.granted,
        grantedAt: row.granted_at,
        version: row.consent_version,
      };
      return acc;
    }, {});

    res.json({ consents });
  } catch (error) {
    logger.error('Error fetching consent status', { error });
    res.status(500).json({ error: 'Failed to fetch consent' });
  }
};

export const withdrawConsent = async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.userId;
    const { consentType } = req.body; // 'analytics' or 'marketing'

    if (consentType === 'essential') {
      return res.status(400).json({
        error: 'Cannot withdraw essential consent (required for service operation)'
      });
    }

    await db.query(
      `UPDATE user_consents
       SET withdrawn_at = NOW()
       WHERE user_id = $1
         AND consent_type = $2
         AND withdrawn_at IS NULL`,
      [userId, consentType]
    );

    logger.info('Consent withdrawn', { userId, consentType });

    res.json({ success: true, message: `${consentType} consent withdrawn` });
  } catch (error) {
    logger.error('Error withdrawing consent', { error });
    res.status(500).json({ error: 'Failed to withdraw consent' });
  }
};

// Helper function
async function getActivePrivacyPolicyVersion(): Promise<string> {
  const { rows } = await db.query(
    'SELECT version FROM privacy_policy_versions WHERE is_active = true LIMIT 1'
  );
  return rows[0]?.version || '1.0.0';
}
```

2. `/server/routes/gdpr.ts`
```typescript
import express from 'express';
import { clerkAuthMiddleware } from '../middleware/clerkAuth';
import * as consentController from '../controllers/gdpr/consent';

const router = express.Router();

// Consent endpoints (can be used by authenticated or anonymous users)
router.post('/consent', consentController.recordConsent);
router.get('/consent', consentController.getConsentStatus);
router.delete('/consent', clerkAuthMiddleware, consentController.withdrawConsent);

export default router;
```

3. Add to `/server/routes.ts`:
```typescript
import gdprRoutes from './routes/gdpr';

// ... existing code ...

app.use('/api/gdpr', gdprRoutes);
```

#### Frontend Implementation

**Files to Create:**

1. `/client/src/components/gdpr/CookieConsentBanner.tsx`
```typescript
import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { X } from 'lucide-react';

interface ConsentPreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

export const CookieConsentBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    essential: true, // Always true
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check if user has already consented
    const checkConsent = async () => {
      const anonymousId = localStorage.getItem('anonymousId') || generateAnonymousId();
      const response = await fetch(`/api/gdpr/consent?anonymousId=${anonymousId}`);
      const { consents } = await response.json();

      if (!consents || Object.keys(consents).length === 0) {
        setIsVisible(true);
      }
    };

    checkConsent();
  }, []);

  const generateAnonymousId = () => {
    const id = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('anonymousId', id);
    return id;
  };

  const handleAcceptAll = async () => {
    await saveConsent({ essential: true, analytics: true, marketing: true });
    setIsVisible(false);
  };

  const handleAcceptEssential = async () => {
    await saveConsent({ essential: true, analytics: false, marketing: false });
    setIsVisible(false);
  };

  const handleSavePreferences = async () => {
    await saveConsent(preferences);
    setIsVisible(false);
  };

  const saveConsent = async (prefs: ConsentPreferences) => {
    const anonymousId = localStorage.getItem('anonymousId') || generateAnonymousId();

    await fetch('/api/gdpr/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...prefs, anonymousId }),
    });

    // Store in localStorage for quick checks
    localStorage.setItem('cookieConsent', JSON.stringify(prefs));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-black/50 to-transparent">
      <Card className="max-w-4xl mx-auto p-6 shadow-2xl">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">We value your privacy</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsVisible(false)}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          We use cookies to enhance your browsing experience, serve personalized content, and
          analyze our traffic. By clicking "Accept All", you consent to our use of cookies.{' '}
          <a href="/privacy-policy" className="underline">
            Read our Privacy Policy
          </a>
        </p>

        {showDetails && (
          <div className="space-y-3 mb-4 p-4 bg-muted rounded-lg">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="essential"
                checked={preferences.essential}
                disabled
                className="mt-1"
              />
              <div className="flex-1">
                <label htmlFor="essential" className="text-sm font-medium">
                  Essential Cookies (Required)
                </label>
                <p className="text-xs text-muted-foreground">
                  Necessary for authentication, security, and basic site functionality.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="analytics"
                checked={preferences.analytics}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, analytics: !!checked }))
                }
                className="mt-1"
              />
              <div className="flex-1">
                <label htmlFor="analytics" className="text-sm font-medium">
                  Analytics Cookies
                </label>
                <p className="text-xs text-muted-foreground">
                  Help us understand how you use our service to improve your experience.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="marketing"
                checked={preferences.marketing}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, marketing: !!checked }))
                }
                className="mt-1"
              />
              <div className="flex-1">
                <label htmlFor="marketing" className="text-sm font-medium">
                  Marketing Cookies
                </label>
                <p className="text-xs text-muted-foreground">
                  Used to deliver personalized advertisements and measure campaign effectiveness.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleAcceptAll} className="flex-1 sm:flex-none">
            Accept All
          </Button>
          <Button
            onClick={handleAcceptEssential}
            variant="outline"
            className="flex-1 sm:flex-none"
          >
            Essential Only
          </Button>
          {showDetails ? (
            <Button
              onClick={handleSavePreferences}
              variant="secondary"
              className="flex-1 sm:flex-none"
            >
              Save Preferences
            </Button>
          ) : (
            <Button
              onClick={() => setShowDetails(true)}
              variant="ghost"
              className="flex-1 sm:flex-none"
            >
              Customize
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};
```

2. Add to `/client/src/App.tsx`:
```typescript
import { CookieConsentBanner } from './components/gdpr/CookieConsentBanner';

// ... existing code ...

function App() {
  return (
    <>
      {/* Existing app content */}
      <CookieConsentBanner />
    </>
  );
}
```

### 1.2 Privacy Policy System

#### Backend Implementation

1. `/server/controllers/gdpr/privacy-policy.ts`
```typescript
import { Request, Response } from 'express';
import { db } from '../../utils/database';
import { logger } from '../../utils/logger';

export const getActivePrivacyPolicy = async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT version, content, effective_date
       FROM privacy_policy_versions
       WHERE is_active = true
       LIMIT 1`
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No active privacy policy found' });
    }

    res.json(rows[0]);
  } catch (error) {
    logger.error('Error fetching privacy policy', { error });
    res.status(500).json({ error: 'Failed to fetch privacy policy' });
  }
};

export const getAllVersions = async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT id, version, effective_date, is_active
       FROM privacy_policy_versions
       ORDER BY effective_date DESC`
    );

    res.json({ versions: rows });
  } catch (error) {
    logger.error('Error fetching privacy policy versions', { error });
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
};

// Admin endpoint to create new version
export const createVersion = async (req: Request, res: Response) => {
  try {
    const { version, content, effectiveDate } = req.body;

    // Deactivate current active version
    await db.query('UPDATE privacy_policy_versions SET is_active = false');

    // Insert new version
    const { rows } = await db.query(
      `INSERT INTO privacy_policy_versions (version, content, effective_date, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [version, content, effectiveDate]
    );

    logger.info('New privacy policy version created', { version });

    res.json({ success: true, policy: rows[0] });
  } catch (error) {
    logger.error('Error creating privacy policy version', { error });
    res.status(500).json({ error: 'Failed to create version' });
  }
};
```

#### Frontend Implementation

1. `/client/src/pages/privacy-policy.tsx`
```typescript
import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export const PrivacyPolicyPage: React.FC = () => {
  const [policy, setPolicy] = useState<{ content: string; version: string; effectiveDate: string } | null>(null);

  useEffect(() => {
    fetch('/api/gdpr/privacy-policy')
      .then((res) => res.json())
      .then((data) => setPolicy(data));
  }, []);

  if (!policy) return <div>Loading...</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
      <p className="text-muted-foreground mb-8">
        Version {policy.version} | Effective Date: {new Date(policy.effectiveDate).toLocaleDateString()}
      </p>
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <ReactMarkdown>{policy.content}</ReactMarkdown>
      </div>
    </div>
  );
};
```

### 1.3 Deliverables

- ✅ Cookie consent banner with granular controls
- ✅ Consent storage in database with proof (IP, timestamp, version)
- ✅ Privacy policy versioning system
- ✅ Consent withdrawal API
- ✅ Anonymous user tracking with consent

---

## Phase 2: Data Subject Rights

**Duration:** 3-4 weeks
**Priority:** CRITICAL - Core GDPR rights

### 2.1 Subject Access Request (Data Export)

#### Database Schema

```sql
-- New table: data_export_requests
CREATE TABLE data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  export_format VARCHAR(10) NOT NULL DEFAULT 'json', -- json, csv, html
  file_path TEXT, -- S3/storage path to export file
  file_size_bytes BIGINT,
  expires_at TIMESTAMPTZ, -- Link expires after 7 days
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_data_export_requests_user_id ON data_export_requests(user_id);
CREATE INDEX idx_data_export_requests_status ON data_export_requests(status);
CREATE INDEX idx_data_export_requests_expires_at ON data_export_requests(expires_at);
```

#### Backend Implementation

1. `/server/controllers/gdpr/data-export.ts`
```typescript
import { Request, Response } from 'express';
import { db } from '../../utils/database';
import { logger } from '../../utils/logger';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { addJob } from '../../jobs/queue';

export const requestDataExport = async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { format = 'json' } = req.body;

    // Check for existing pending request
    const { rows: existing } = await db.query(
      `SELECT id FROM data_export_requests
       WHERE user_id = $1 AND status IN ('pending', 'processing')
       LIMIT 1`,
      [userId]
    );

    if (existing.length > 0) {
      return res.status(429).json({
        error: 'A data export request is already in progress'
      });
    }

    // Create export request
    const { rows } = await db.query(
      `INSERT INTO data_export_requests (user_id, export_format, status)
       VALUES ($1, $2, 'pending')
       RETURNING id`,
      [userId, format]
    );

    const requestId = rows[0].id;

    // Queue background job
    await addJob('data-export', { requestId, userId, format });

    logger.info('Data export requested', { userId, requestId });

    res.json({
      success: true,
      requestId,
      message: 'Data export initiated. You will receive an email when ready.'
    });
  } catch (error) {
    logger.error('Error requesting data export', { error });
    res.status(500).json({ error: 'Failed to request data export' });
  }
};

export const getExportStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { requestId } = req.params;

    const { rows } = await db.query(
      `SELECT id, status, export_format, file_path, file_size_bytes,
              request_date, completed_at, expires_at, error_message
       FROM data_export_requests
       WHERE id = $1 AND user_id = $2`,
      [requestId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Export request not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    logger.error('Error fetching export status', { error });
    res.status(500).json({ error: 'Failed to fetch status' });
  }
};

export const downloadExport = async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { requestId } = req.params;

    const { rows } = await db.query(
      `SELECT file_path, export_format, expires_at
       FROM data_export_requests
       WHERE id = $1 AND user_id = $2 AND status = 'completed'`,
      [requestId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Export not found or not ready' });
    }

    const { file_path, export_format, expires_at } = rows[0];

    if (new Date() > new Date(expires_at)) {
      return res.status(410).json({ error: 'Export has expired' });
    }

    // Stream file download
    res.download(file_path, `data-export.${export_format}.zip`);
  } catch (error) {
    logger.error('Error downloading export', { error });
    res.status(500).json({ error: 'Failed to download export' });
  }
};
```

2. `/server/jobs/data-export-processor.ts`
```typescript
import { Job } from 'bullmq';
import { db } from '../utils/database';
import { logger } from '../utils/logger';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { mkdirSync } from 'fs';

interface ExportJobData {
  requestId: string;
  userId: string;
  format: string;
}

export const processDataExport = async (job: Job<ExportJobData>) => {
  const { requestId, userId, format } = job.data;

  try {
    logger.info('Starting data export', { requestId, userId });

    // Update status to processing
    await db.query(
      `UPDATE data_export_requests SET status = 'processing' WHERE id = $1`,
      [requestId]
    );

    // Collect all user data
    const userData = await collectUserData(userId);

    // Create export directory
    const exportDir = join(process.cwd(), 'exports');
    mkdirSync(exportDir, { recursive: true });

    const exportPath = join(exportDir, `${requestId}.zip`);
    const output = createWriteStream(exportPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Add data files to archive
    if (format === 'json') {
      archive.append(JSON.stringify(userData, null, 2), { name: 'user-data.json' });

      // Add individual entity files
      archive.append(JSON.stringify(userData.chatbots, null, 2), { name: 'chatbots.json' });
      archive.append(JSON.stringify(userData.conversations, null, 2), { name: 'conversations.json' });
      archive.append(JSON.stringify(userData.analytics, null, 2), { name: 'analytics.json' });
    } else if (format === 'html') {
      const html = generateHtmlReport(userData);
      archive.append(html, { name: 'user-data.html' });
    }

    // Add README
    archive.append(generateReadme(userData), { name: 'README.txt' });

    await archive.finalize();

    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });

    const fileSize = archive.pointer();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Update database
    await db.query(
      `UPDATE data_export_requests
       SET status = 'completed', file_path = $1, file_size_bytes = $2,
           completed_at = NOW(), expires_at = $3
       WHERE id = $4`,
      [exportPath, fileSize, expiresAt, requestId]
    );

    logger.info('Data export completed', { requestId, fileSize });

    // TODO: Send email notification

  } catch (error) {
    logger.error('Data export failed', { requestId, error });

    await db.query(
      `UPDATE data_export_requests
       SET status = 'failed', error_message = $1
       WHERE id = $2`,
      [error.message, requestId]
    );

    throw error;
  }
};

async function collectUserData(userId: string) {
  // Fetch user profile
  const { rows: [user] } = await db.query(
    'SELECT id, email, created_at FROM users WHERE id = $1',
    [userId]
  );

  // Fetch chatbots
  const { rows: chatbots } = await db.query(
    `SELECT id, name, website_url, status, settings, created_at, updated_at
     FROM chatbots WHERE user_id = $1`,
    [userId]
  );

  // Fetch conversations
  const { rows: conversations } = await db.query(
    `SELECT c.id, c.chatbot_id, c.session_id, c.messages, c.created_at,
            cb.name as chatbot_name
     FROM conversations c
     JOIN chatbots cb ON c.chatbot_id = cb.id
     WHERE cb.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId]
  );

  // Fetch analytics
  const { rows: analytics } = await db.query(
    `SELECT ws.chatbot_id, ws.session_id, ws.started_at, ws.ended_at,
            ws.device_type, ws.browser, ws.country, ws.message_count
     FROM widget_sessions ws
     JOIN chatbots cb ON ws.chatbot_id = cb.id
     WHERE cb.user_id = $1
     ORDER BY ws.started_at DESC
     LIMIT 10000`, // Reasonable limit
    [userId]
  );

  // Fetch subscription
  const { rows: [subscription] } = await db.query(
    `SELECT plan_type, status, start_date, end_date, usage_limits, messages_count
     FROM subscriptions WHERE user_id = $1`,
    [userId]
  );

  // Fetch consents
  const { rows: consents } = await db.query(
    `SELECT consent_type, granted, granted_at, withdrawn_at, consent_version
     FROM user_consents WHERE user_id = $1
     ORDER BY granted_at DESC`,
    [userId]
  );

  return {
    user,
    chatbots,
    conversations,
    analytics,
    subscription,
    consents,
    exportMetadata: {
      exportDate: new Date().toISOString(),
      totalChatbots: chatbots.length,
      totalConversations: conversations.length,
      totalAnalyticsRecords: analytics.length,
    },
  };
}

function generateReadme(userData: any): string {
  return `
ConvoAI - Personal Data Export
===============================

Export Date: ${new Date().toISOString()}
User ID: ${userData.user.id}
Email: ${userData.user.email}

This archive contains all your personal data stored in ConvoAI.

Contents:
---------
- user-data.json: Complete data export in JSON format
- chatbots.json: All your chatbot configurations
- conversations.json: All chat conversations
- analytics.json: Widget usage analytics
- README.txt: This file

Data Summary:
-------------
- Total Chatbots: ${userData.exportMetadata.totalChatbots}
- Total Conversations: ${userData.exportMetadata.totalConversations}
- Total Analytics Records: ${userData.exportMetadata.totalAnalyticsRecords}
- Account Created: ${userData.user.created_at}

For questions about this export, please contact: support@convoai.com

This export link expires 7 days from generation.
  `.trim();
}

function generateHtmlReport(userData: any): string {
  // Simple HTML template for human-readable export
  return `
<!DOCTYPE html>
<html>
<head>
  <title>ConvoAI Data Export</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f4f4f4; }
  </style>
</head>
<body>
  <h1>Your ConvoAI Data Export</h1>
  <p><strong>Export Date:</strong> ${new Date().toISOString()}</p>
  <p><strong>User ID:</strong> ${userData.user.id}</p>
  <p><strong>Email:</strong> ${userData.user.email}</p>

  <h2>Chatbots (${userData.chatbots.length})</h2>
  <table>
    <tr><th>Name</th><th>Website</th><th>Status</th><th>Created</th></tr>
    ${userData.chatbots.map(cb => `
      <tr>
        <td>${cb.name}</td>
        <td>${cb.website_url}</td>
        <td>${cb.status}</td>
        <td>${new Date(cb.created_at).toLocaleDateString()}</td>
      </tr>
    `).join('')}
  </table>

  <h2>Conversations (${userData.conversations.length})</h2>
  <p>Total conversations: ${userData.conversations.length}</p>

  <h2>Analytics Summary</h2>
  <p>Total sessions tracked: ${userData.analytics.length}</p>
</body>
</html>
  `.trim();
}
```

### 2.2 Right to Erasure (Enhanced Account Deletion)

#### Database Schema

```sql
-- New table: deletion_requests
CREATE TABLE deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  scheduled_deletion_date TIMESTAMPTZ, -- 30-day grace period
  completed_at TIMESTAMPTZ,

  -- Audit trail
  deleted_data JSONB, -- Summary of deleted data
  retention_exceptions JSONB, -- Data kept for legal reasons

  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_deletion_requests_user_id ON deletion_requests(user_id);
CREATE INDEX idx_deletion_requests_scheduled ON deletion_requests(scheduled_deletion_date);
```

#### Backend Implementation

1. `/server/controllers/gdpr/deletion.ts`
```typescript
import { Request, Response } from 'express';
import { db } from '../../utils/database';
import { logger } from '../../utils/logger';
import { addJob } from '../../jobs/queue';

export const requestAccountDeletion = async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { reason, confirmEmail } = req.body;

    // Verify email confirmation
    const { rows: [user] } = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    );

    if (user.email !== confirmEmail) {
      return res.status(400).json({ error: 'Email confirmation does not match' });
    }

    // Check for existing deletion request
    const { rows: existing } = await db.query(
      `SELECT id FROM deletion_requests
       WHERE user_id = $1 AND status IN ('pending', 'processing')`,
      [userId]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        error: 'A deletion request is already in progress'
      });
    }

    // Schedule deletion for 30 days from now (grace period)
    const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const { rows } = await db.query(
      `INSERT INTO deletion_requests
       (user_id, reason, status, scheduled_deletion_date)
       VALUES ($1, $2, 'pending', $3)
       RETURNING id, scheduled_deletion_date`,
      [userId, reason, scheduledDate]
    );

    logger.info('Account deletion requested', { userId, requestId: rows[0].id });

    // TODO: Send confirmation email with cancellation link

    res.json({
      success: true,
      requestId: rows[0].id,
      scheduledDeletion: rows[0].scheduled_deletion_date,
      message: 'Account deletion scheduled. You have 30 days to cancel.',
    });
  } catch (error) {
    logger.error('Error requesting deletion', { error });
    res.status(500).json({ error: 'Failed to request deletion' });
  }
};

export const cancelDeletionRequest = async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { requestId } = req.params;

    const { rowCount } = await db.query(
      `DELETE FROM deletion_requests
       WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [requestId, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Deletion request not found or cannot be cancelled' });
    }

    logger.info('Deletion request cancelled', { userId, requestId });

    res.json({ success: true, message: 'Deletion request cancelled' });
  } catch (error) {
    logger.error('Error cancelling deletion', { error });
    res.status(500).json({ error: 'Failed to cancel deletion' });
  }
};

export const getDeletionStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.userId;

    const { rows } = await db.query(
      `SELECT id, status, request_date, scheduled_deletion_date, completed_at
       FROM deletion_requests
       WHERE user_id = $1
       ORDER BY request_date DESC
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.json({ hasPendingRequest: false });
    }

    res.json({ hasPendingRequest: true, ...rows[0] });
  } catch (error) {
    logger.error('Error fetching deletion status', { error });
    res.status(500).json({ error: 'Failed to fetch status' });
  }
};
```

2. `/server/jobs/account-deletion-processor.ts`
```typescript
import { Job } from 'bullmq';
import { db } from '../utils/database';
import { logger } from '../utils/logger';

export const processAccountDeletion = async (job: Job<{ requestId: string }>) => {
  const { requestId } = job.data;

  try {
    // Get deletion request
    const { rows: [request] } = await db.query(
      'SELECT user_id, scheduled_deletion_date FROM deletion_requests WHERE id = $1',
      [requestId]
    );

    if (!request) {
      throw new Error('Deletion request not found');
    }

    // Verify scheduled date has passed
    if (new Date() < new Date(request.scheduled_deletion_date)) {
      logger.info('Deletion not yet scheduled', { requestId });
      return;
    }

    const userId = request.user_id;

    logger.info('Starting account deletion', { userId, requestId });

    // Update status
    await db.query(
      `UPDATE deletion_requests SET status = 'processing' WHERE id = $1`,
      [requestId]
    );

    // Collect deletion summary
    const deletionSummary = {
      chatbots: await countRecords('chatbots', 'user_id', userId),
      conversations: await countConversations(userId),
      embeddings: await countEmbeddings(userId),
      analytics: await countAnalytics(userId),
    };

    // Begin transaction
    await db.query('BEGIN');

    try {
      // Delete user (cascades to chatbots, conversations, etc.)
      await db.query('DELETE FROM users WHERE id = $1', [userId]);

      // Keep billing records for 7 years (legal requirement)
      const { rows: billingRecords } = await db.query(
        `SELECT * FROM subscriptions WHERE user_id = $1`,
        [userId]
      );

      // Anonymize billing records instead of deleting
      await db.query(
        `UPDATE subscriptions
         SET user_id = NULL,
             anonymized_at = NOW(),
             anonymized_reason = 'GDPR deletion request'
         WHERE user_id = $1`,
        [userId]
      );

      await db.query('COMMIT');

      // Update deletion request
      await db.query(
        `UPDATE deletion_requests
         SET status = 'completed',
             completed_at = NOW(),
             deleted_data = $1,
             retention_exceptions = $2
         WHERE id = $3`,
        [
          JSON.stringify(deletionSummary),
          JSON.stringify({ billingRecords: billingRecords.length }),
          requestId,
        ]
      );

      logger.info('Account deletion completed', { userId, requestId, deletionSummary });

    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    logger.error('Account deletion failed', { requestId, error });

    await db.query(
      `UPDATE deletion_requests SET status = 'failed' WHERE id = $1`,
      [requestId]
    );

    throw error;
  }
};

async function countRecords(table: string, column: string, value: string): Promise<number> {
  const { rows } = await db.query(`SELECT COUNT(*) as count FROM ${table} WHERE ${column} = $1`, [value]);
  return parseInt(rows[0].count);
}

async function countConversations(userId: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*) as count
     FROM conversations c
     JOIN chatbots cb ON c.chatbot_id = cb.id
     WHERE cb.user_id = $1`,
    [userId]
  );
  return parseInt(rows[0].count);
}

async function countEmbeddings(userId: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*) as count
     FROM embeddings e
     JOIN chatbots cb ON e.chatbot_id = cb.id
     WHERE cb.user_id = $1`,
    [userId]
  );
  return parseInt(rows[0].count);
}

async function countAnalytics(userId: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*) as count
     FROM widget_sessions ws
     JOIN chatbots cb ON ws.chatbot_id = cb.id
     WHERE cb.user_id = $1`,
    [userId]
  );
  return parseInt(rows[0].count);
}
```

3. `/server/jobs/scheduler.ts` (cron job to process scheduled deletions)
```typescript
import cron from 'node-cron';
import { db } from '../utils/database';
import { addJob } from './queue';
import { logger } from '../utils/logger';

// Run daily at 3 AM UTC
export function scheduleAccountDeletions() {
  cron.schedule('0 3 * * *', async () => {
    logger.info('Running scheduled account deletions check');

    const { rows } = await db.query(
      `SELECT id FROM deletion_requests
       WHERE status = 'pending'
         AND scheduled_deletion_date <= NOW()`
    );

    for (const request of rows) {
      await addJob('account-deletion', { requestId: request.id });
      logger.info('Queued account deletion', { requestId: request.id });
    }
  });
}
```

### 2.3 Deliverables

- ✅ Data export API with JSON/HTML formats
- ✅ Background job processor for large exports
- ✅ Export expiration (7 days)
- ✅ Enhanced deletion with 30-day grace period
- ✅ Deletion cancellation option
- ✅ Legal retention exceptions (billing records)
- ✅ Audit trail for all deletions

---

## Phase 3: Audit & Compliance

**Duration:** 2-3 weeks
**Priority:** MEDIUM - Accountability and monitoring

### 3.1 Audit Logging System

#### Database Schema

```sql
-- New table: audit_logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id VARCHAR(255),
  action VARCHAR(100) NOT NULL, -- 'data_access', 'data_export', 'consent_granted', 'account_deleted'
  resource_type VARCHAR(50), -- 'chatbot', 'conversation', 'user_profile'
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(100), -- Correlate with application logs

  -- Make immutable (cannot be updated)
  CONSTRAINT immutable_log CHECK (created_at = timestamp)
);

-- Indexes for fast querying
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Prevent updates and deletes
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

#### Backend Implementation

1. `/server/middleware/audit.ts`
```typescript
import { Request, Response, NextFunction } from 'express';
import { db } from '../utils/database';
import { logger } from '../utils/logger';

interface AuditLogEntry {
  userId?: string;
  anonymousId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs
       (user_id, anonymous_id, action, resource_type, resource_id, details, ip_address, user_agent, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.userId || null,
        entry.anonymousId || null,
        entry.action,
        entry.resourceType || null,
        entry.resourceId || null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ipAddress || null,
        entry.userAgent || null,
        entry.requestId || null,
      ]
    );
  } catch (error) {
    // Don't fail request if audit logging fails, but log the error
    logger.error('Failed to write audit log', { error, entry });
  }
}

// Middleware to automatically log data access
export function auditDataAccess(resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json;

    res.json = function (data: any) {
      // Log successful data access
      if (res.statusCode < 400) {
        const resourceId = req.params.id || req.params.chatbotId || req.params.conversationId;

        logAudit({
          userId: req.auth?.userId,
          action: 'data_access',
          resourceType,
          resourceId,
          details: {
            method: req.method,
            path: req.path,
            query: req.query,
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          requestId: req.id,
        });
      }

      return originalJson.call(this, data);
    };

    next();
  };
}
```

2. Add audit logging to existing controllers:

```typescript
// In /server/controllers/chatbots.ts
import { logAudit } from '../middleware/audit';

export const getChatbot = async (req: Request, res: Response) => {
  // ... existing code ...

  // Log access
  await logAudit({
    userId: req.auth!.userId,
    action: 'chatbot_viewed',
    resourceType: 'chatbot',
    resourceId: chatbot.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    requestId: req.id,
  });

  res.json(chatbot);
};

// In /server/controllers/gdpr/consent.ts
export const recordConsent = async (req: Request, res: Response) => {
  // ... existing code ...

  await logAudit({
    userId,
    anonymousId,
    action: 'consent_granted',
    details: { essential, analytics, marketing },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
};
```

### 3.2 Admin Dashboard for Compliance

#### Frontend Implementation

1. `/client/src/pages/dashboard/admin/compliance.tsx`
```typescript
import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/card';
import { Table } from '../../../components/ui/table';

export const ComplianceDashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeConsents: 0,
    deletionRequests: 0,
    exportRequests: 0,
    auditLogs: 0,
  });

  useEffect(() => {
    fetch('/api/admin/compliance/stats')
      .then((res) => res.json())
      .then(setStats);
  }, []);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">GDPR Compliance Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="p-4">
          <h3 className="text-sm text-muted-foreground">Active Consents</h3>
          <p className="text-3xl font-bold">{stats.activeConsents}</p>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm text-muted-foreground">Pending Deletions</h3>
          <p className="text-3xl font-bold">{stats.deletionRequests}</p>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm text-muted-foreground">Export Requests (24h)</h3>
          <p className="text-3xl font-bold">{stats.exportRequests}</p>
        </Card>
      </div>

      {/* Recent Audit Logs */}
      {/* Deletion Queue */}
      {/* Export Queue */}
    </div>
  );
};
```

### 3.3 Deliverables

- ✅ Immutable audit log table
- ✅ Automatic logging for data access
- ✅ Consent change tracking
- ✅ Admin compliance dashboard
- ✅ Audit log query API

---

## Phase 4: Documentation & Monitoring

**Duration:** 1-2 weeks
**Priority:** MEDIUM - Legal documentation

### 4.1 Data Processing Inventory

#### Database Schema

```sql
-- New table: data_processing_activities
CREATE TABLE data_processing_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_name VARCHAR(255) NOT NULL,
  purpose TEXT NOT NULL,
  legal_basis VARCHAR(50) NOT NULL, -- 'consent', 'contract', 'legitimate_interest', 'legal_obligation'
  data_categories TEXT[] NOT NULL, -- ['identity', 'contact', 'usage', 'technical']
  data_subjects TEXT[] NOT NULL, -- ['customers', 'visitors', 'employees']
  recipients TEXT[], -- Third parties (OpenAI, Clerk, Paddle)
  transfer_countries TEXT[], -- Countries where data is transferred
  retention_period VARCHAR(100),
  security_measures TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2 Privacy Notice Generator

Dynamic privacy policy based on actual data processing activities.

### 4.3 Compliance Monitoring

- Weekly GDPR compliance reports
- Consent rate tracking
- Data retention compliance checks
- Third-party processor audits

### 4.4 Deliverables

- ✅ Data processing inventory
- ✅ Automated privacy policy generation
- ✅ Compliance monitoring dashboard
- ✅ Weekly compliance reports
- ✅ Data retention policy enforcement

---

## Database Schema Changes

### Migration Plan

All schema changes will be versioned in Supabase migrations:

```
/supabase/migrations/
├── 010_gdpr_consent_tables.sql
├── 011_gdpr_data_export_tables.sql
├── 012_gdpr_deletion_tables.sql
├── 013_gdpr_audit_logs.sql
├── 014_gdpr_processing_inventory.sql
└── 015_gdpr_indexes_optimization.sql
```

### Rollback Strategy

Each migration includes a rollback script for safe deployment.

---

## API Endpoints Specification

### Public Endpoints (No Auth Required)

```
POST   /api/gdpr/consent                    - Record cookie consent
GET    /api/gdpr/consent?anonymousId=xxx    - Get consent status
GET    /api/gdpr/privacy-policy             - Get active privacy policy
GET    /api/gdpr/privacy-policy/versions    - List all versions
```

### Authenticated Endpoints (Clerk Auth Required)

```
DELETE /api/gdpr/consent                    - Withdraw consent
POST   /api/gdpr/data-export                - Request data export
GET    /api/gdpr/data-export/:id/status     - Check export status
GET    /api/gdpr/data-export/:id/download   - Download export
POST   /api/gdpr/delete-account             - Request account deletion
DELETE /api/gdpr/delete-account/:id         - Cancel deletion request
GET    /api/gdpr/delete-account/status      - Check deletion status
GET    /api/gdpr/audit-logs                 - View own audit logs
```

### Admin Endpoints (Admin Role Required)

```
GET    /api/admin/compliance/stats          - Compliance dashboard stats
GET    /api/admin/compliance/audit-logs     - All audit logs
GET    /api/admin/compliance/export-queue   - Pending exports
GET    /api/admin/compliance/deletion-queue - Pending deletions
POST   /api/admin/privacy-policy            - Create new policy version
GET    /api/admin/data-processing           - List processing activities
```

---

## Security Considerations

### 1. Authentication & Authorization

- All sensitive GDPR endpoints require Clerk authentication
- Export downloads validated by user ID + request ID
- Admin endpoints require role-based access control

### 2. Data Protection

- Export files encrypted at rest
- Export links expire after 7 days
- Secure file deletion (overwrite before removal)
- Audit logs are immutable

### 3. Rate Limiting

- Data export: 1 request per user per 24 hours
- Account deletion: 1 request per user per 30 days
- Consent recording: 100 requests per IP per hour

### 4. Privacy by Design

- Minimal data collection principle
- Pseudonymization for analytics (IP anonymization)
- Encryption in transit (HTTPS) and at rest (database)
- Regular security audits

---

## Testing Strategy

### Unit Tests

- Consent recording logic
- Data export aggregation
- Deletion cascade validation
- Audit log immutability

### Integration Tests

- End-to-end data export workflow
- Account deletion with grace period
- Consent withdrawal effects
- Privacy policy versioning

### Compliance Tests

- GDPR Article 15 compliance (Data export includes all data)
- GDPR Article 17 compliance (Full deletion)
- Consent proof validity
- Audit trail completeness

### Load Tests

- Export generation for large datasets (10K+ conversations)
- Concurrent export requests
- Deletion performance for users with extensive data

---

## Deployment Plan

### Phase 1 Deployment (Consent Management)

1. Database migration (consent tables)
2. Backend API deployment
3. Frontend cookie banner deployment
4. Privacy policy page deployment
5. Monitoring setup

### Phase 2 Deployment (Data Rights)

1. Database migration (export/deletion tables)
2. Background job queue setup
3. Export processor deployment
4. Deletion scheduler deployment
5. Frontend settings page updates

### Phase 3 Deployment (Audit & Compliance)

1. Audit log table migration
2. Audit middleware deployment
3. Admin dashboard deployment
4. Monitoring alerts setup

### Phase 4 Deployment (Documentation)

1. Processing inventory setup
2. Privacy notice generator
3. Compliance reports automation

### Rollout Strategy

- **Week 1-2**: Phase 1 (Foundation)
- **Week 3-6**: Phase 2 (Data Rights)
- **Week 7-9**: Phase 3 (Audit)
- **Week 10-12**: Phase 4 (Documentation)

---

## Maintenance & Monitoring

### Daily Checks

- Export queue health
- Deletion queue health
- Audit log write failures
- Export file expiration cleanup

### Weekly Reviews

- Consent rate trends
- Export request volume
- Deletion request trends
- Audit log analysis

### Monthly Audits

- Privacy policy review
- Third-party processor compliance
- Data retention policy enforcement
- Security measure effectiveness

### Alerts

- Export generation failure
- Deletion job failure
- Audit log write failure
- Expired export cleanup failure
- Unusual deletion request spike

---

## Third-Party Data Processor Compliance

### Current Processors

1. **Clerk (Authentication)**
   - Data Shared: User ID, email
   - Purpose: Authentication
   - DPA: Required
   - GDPR Compliant: Yes

2. **OpenAI (LLM Processing)**
   - Data Shared: Chat messages
   - Purpose: AI responses
   - DPA: Required
   - Data Retention: 30 days (OpenAI policy)

3. **Paddle (Payment Processing)**
   - Data Shared: Email, billing info
   - Purpose: Subscription billing
   - DPA: Required
   - GDPR Compliant: Yes

4. **Upstash (Redis Cache)**
   - Data Shared: Session data, cached data
   - Purpose: Performance optimization
   - DPA: Required
   - Data Retention: TTL-based (configurable)

5. **Supabase (Database)**
   - Data Shared: All application data
   - Purpose: Primary data storage
   - DPA: Required
   - GDPR Compliant: Yes (EU region available)

### Action Items

- ✅ Sign DPAs with all processors
- ✅ Document data flows
- ✅ Verify GDPR compliance
- ✅ Configure data retention policies
- ✅ Implement data deletion cascade to third parties

---

## Cost Estimate

### Development Costs

| Phase | Duration | Resources | Cost Estimate |
|-------|----------|-----------|---------------|
| Phase 1 | 2-3 weeks | 1 Senior Dev | $12,000 - $18,000 |
| Phase 2 | 3-4 weeks | 1 Senior Dev | $18,000 - $24,000 |
| Phase 3 | 2-3 weeks | 1 Senior Dev | $12,000 - $18,000 |
| Phase 4 | 1-2 weeks | 1 Developer | $6,000 - $12,000 |
| **Total** | **8-12 weeks** | | **$48,000 - $72,000** |

### Infrastructure Costs

- Additional database storage for audit logs: ~$50/month
- File storage for exports (S3/equivalent): ~$20/month
- Background job processing (additional Redis workers): ~$30/month

### Ongoing Costs

- Legal review of privacy policy: $2,000 - $5,000 (one-time)
- DPA negotiation with processors: $1,000 - $3,000 per processor
- Annual compliance audit: $5,000 - $15,000
- Monitoring and maintenance: 4-8 hours/month (~$1,000/month)

---

## Success Metrics

### Compliance Metrics

- ✅ 100% of users presented with cookie consent
- ✅ Data export requests fulfilled within 24 hours
- ✅ Account deletions completed within 30 days
- ✅ Audit logs capture 100% of data access events
- ✅ Zero GDPR-related complaints

### Performance Metrics

- Export generation: < 5 minutes for 95% of requests
- Deletion execution: < 1 minute for 95% of requests
- Consent recording latency: < 100ms
- Audit log write latency: < 50ms (async)

### Business Metrics

- Consent acceptance rate: > 70% for analytics
- Deletion request rate: < 2% of users
- Export request rate: < 5% of users
- Support ticket reduction for privacy requests: > 80%

---

## Risk Assessment

### High Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Non-compliance penalties | €20M or 4% revenue | Thorough testing, legal review |
| Data breach during export | High | Encryption, secure storage, expiration |
| Incomplete data deletion | High | Comprehensive cascade testing |
| Audit log failure | Medium | Redundant logging, monitoring |

### Medium Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance degradation | Medium | Async jobs, caching, optimization |
| Third-party non-compliance | Medium | Regular audits, DPAs |
| Privacy policy outdated | Medium | Version control, review schedule |

### Low Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| User confusion about rights | Low | Clear UI/UX, help documentation |
| Export format incompatibility | Low | Standard formats (JSON, CSV) |

---

## Conclusion

This enterprise-grade GDPR implementation plan provides a comprehensive roadmap for full compliance with all major GDPR articles. The phased approach allows for incremental delivery while maintaining system stability.

**Key Benefits:**
- ✅ Full legal compliance with GDPR
- ✅ Enhanced user trust and transparency
- ✅ Competitive advantage in European markets
- ✅ Reduced legal risk
- ✅ Scalable architecture for future privacy regulations

**Next Steps:**
1. Review and approve this plan
2. Begin Phase 1: Cookie consent and privacy policy
3. Set up monitoring and testing infrastructure
4. Schedule legal review of privacy documentation
5. Initiate DPA negotiations with third-party processors

For questions or clarifications, please contact the development team.

---

**Document Control:**
- **Author**: Senior Software Engineer
- **Reviewed By**: [Pending]
- **Approved By**: [Pending]
- **Next Review Date**: [To be scheduled]
