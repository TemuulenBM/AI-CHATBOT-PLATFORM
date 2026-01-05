/**
 * GDPR Data Export Background Job Processor
 *
 * Processes user data export requests by:
 * 1. Collecting all user data from the database
 * 2. Generating JSON and HTML exports
 * 3. Creating a ZIP archive
 * 4. Storing the file with expiration date
 * 5. Updating the request status
 *
 * GDPR Articles: 15 (Right of Access), 20 (Data Portability)
 */

import { Worker, Job } from 'bullmq';
import { supabaseAdmin } from '../utils/supabase';
import logger from '../utils/logger';
import archiver from 'archiver';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import EmailService from '../services/email';

// Get Redis connection from existing queues file
import { getRedisConnection } from './queue-connection';

interface DataExportJobData {
  requestId: string;
  userId: string;
  format: string;
}

interface UserData {
  user: any;
  chatbots: any[];
  conversations: any[];
  analytics: {
    sessions: any[];
    events: any[];
  };
  subscription: any;
  consents: any[];
  exportMetadata: {
    exportDate: string;
    totalChatbots: number;
    totalConversations: number;
    totalAnalyticsRecords: number;
  };
}

/**
 * Data Export Worker
 * Processes data export requests in the background
 */
export const dataExportWorker = new Worker<DataExportJobData>(
  'data-export',
  async (job: Job<DataExportJobData>) => {
    const { requestId, userId, format } = job.data;

    logger.info('Starting data export', { requestId, userId, format });

    try {
      // Update status to processing
      await supabaseAdmin
        .from('data_export_requests')
        .update({ status: 'processing' })
        .eq('id', requestId);

      // Collect all user data
      const userData = await collectUserData(userId);

      // Create export directory if it doesn't exist
      const exportDir = join(process.cwd(), 'exports');
      mkdirSync(exportDir, { recursive: true });

      const exportPath = join(exportDir, `${requestId}.zip`);
      const output = createWriteStream(exportPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      // Handle archive events
      archive.on('error', (err) => {
        throw err;
      });

      output.on('error', (err) => {
        throw err;
      });

      archive.pipe(output);

      // Add data files to archive based on format
      if (format === 'json') {
        // Add complete data export
        archive.append(JSON.stringify(userData, null, 2), { name: 'user-data.json' });

        // Add individual entity files for easier parsing
        archive.append(JSON.stringify(userData.chatbots, null, 2), { name: 'chatbots.json' });
        archive.append(JSON.stringify(userData.conversations, null, 2), { name: 'conversations.json' });
        archive.append(JSON.stringify(userData.analytics, null, 2), { name: 'analytics.json' });
        archive.append(JSON.stringify(userData.subscription, null, 2), { name: 'subscription.json' });
        archive.append(JSON.stringify(userData.consents, null, 2), { name: 'consents.json' });
      }

      // Always add HTML report for human readability
      const htmlReport = generateHtmlReport(userData);
      archive.append(htmlReport, { name: 'user-data.html' });

      // Add README file
      const readme = generateReadme(userData);
      archive.append(readme, { name: 'README.txt' });

      // Finalize the archive
      await archive.finalize();

      // Wait for the output stream to finish
      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        output.on('error', (err) => reject(err));
      });

      const fileSize = archive.pointer();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Update database with completed status
      await supabaseAdmin
        .from('data_export_requests')
        .update({
          status: 'completed',
          file_path: exportPath,
          file_size_bytes: fileSize,
          completed_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq('id', requestId);

      logger.info('Data export completed', {
        requestId,
        userId,
        fileSize,
        expiresAt,
      });

      // Send email notification to user with download link
      const downloadUrl = `${process.env.APP_URL}/api/gdpr/data-export/${requestId}/download`;

      if (userData.user?.email) {
        await EmailService.sendDataExportEmail(userData.user.email, downloadUrl, expiresAt);
        logger.info('Data export email sent', { requestId, email: userData.user.email });
      } else {
        logger.warn('User email not found, skipping email notification', { requestId, userId });
      }

      return { fileSize, expiresAt };
    } catch (error) {
      logger.error('Data export failed', { requestId, userId, error });

      // Update database with failed status
      await supabaseAdmin
        .from('data_export_requests')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', requestId);

      throw error;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2, // Process 2 exports at a time
    limiter: {
      max: 10,
      duration: 60000, // Max 10 exports per minute
    },
  }
);

/**
 * Collect all user data from the database
 */
async function collectUserData(userId: string): Promise<UserData> {
  // Fetch user profile
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, email, created_at')
    .eq('id', userId)
    .single();

  // Fetch chatbots
  const { data: chatbots } = await supabaseAdmin
    .from('chatbots')
    .select(`
      id, name, website_url, status, settings, created_at, updated_at,
      last_scraped_at, auto_scrape_enabled, scrape_frequency
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const chatbotIds = chatbots?.map((c) => c.id) || [];

  // Fetch conversations with chatbot names
  let conversations: any[] = [];
  if (chatbotIds.length > 0) {
    const { data: convData } = await supabaseAdmin
      .from('conversations')
      .select(`
        id, chatbot_id, session_id, messages, created_at,
        chatbots!inner(name)
      `)
      .in('chatbot_id', chatbotIds)
      .order('created_at', { ascending: false });

    conversations = convData?.map((c: any) => ({
      ...c,
      chatbot_name: c.chatbots.name,
      chatbots: undefined
    })) || [];
  }

  // Fetch analytics sessions
  let analyticsSessions: any[] = [];
  if (chatbotIds.length > 0) {
    const { data: sessData } = await supabaseAdmin
      .from('widget_sessions')
      .select(`
        chatbot_id, session_id, started_at, ended_at,
        device_type, browser, country, city, message_count,
        chatbots!inner(name)
      `)
      .in('chatbot_id', chatbotIds)
      .order('started_at', { ascending: false })
      .limit(10000);

    analyticsSessions = sessData?.map((s: any) => ({
      ...s,
      chatbot_name: s.chatbots.name,
      chatbots: undefined
    })) || [];
  }

  // Fetch recent analytics events (last 90 days only, as per retention policy)
  let analyticsEvents: any[] = [];
  if (chatbotIds.length > 0) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: eventData } = await supabaseAdmin
      .from('widget_events')
      .select(`
        event_name, properties, timestamp, session_id,
        chatbots!inner(name)
      `)
      .in('chatbot_id', chatbotIds)
      .gte('timestamp', ninetyDaysAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(50000);

    analyticsEvents = eventData?.map((e: any) => ({
      ...e,
      chatbot_name: e.chatbots.name,
      chatbots: undefined
    })) || [];
  }

  // Fetch subscription
  const { data: subscription } = await supabaseAdmin
    .from('subscriptions')
    .select(`
      plan_type, status, start_date, end_date, usage_limits,
      messages_count, chatbots_count, stripe_customer_id, paddle_customer_id
    `)
    .eq('user_id', userId)
    .single();

  // Fetch consents
  const { data: consents } = await supabaseAdmin
    .from('user_consents')
    .select(`
      consent_type, granted, granted_at, withdrawn_at,
      consent_version, ip_address
    `)
    .eq('user_id', userId)
    .order('granted_at', { ascending: false });

  return {
    user: user || {},
    chatbots: chatbots || [],
    conversations,
    analytics: {
      sessions: analyticsSessions,
      events: analyticsEvents,
    },
    subscription: subscription || null,
    consents: consents || [],
    exportMetadata: {
      exportDate: new Date().toISOString(),
      totalChatbots: chatbots?.length || 0,
      totalConversations: conversations.length,
      totalAnalyticsRecords: analyticsSessions.length + analyticsEvents.length,
    },
  };
}

/**
 * Generate README file
 */
function generateReadme(userData: UserData): string {
  return `
ConvoAI - Personal Data Export
===============================

Export Date: ${new Date().toISOString()}
User ID: ${userData.user.id}
Email: ${userData.user.email}

This archive contains all your personal data stored in ConvoAI, in compliance with
GDPR Article 15 (Right of Access) and Article 20 (Data Portability).

Contents:
---------
- user-data.json: Complete data export in JSON format (machine-readable)
- user-data.html: Human-readable report with all your data
- chatbots.json: All your chatbot configurations
- conversations.json: All chat conversations
- analytics.json: Widget usage analytics (last 90 days of events, up to 1 year of sessions)
- subscription.json: Your subscription and billing information
- consents.json: Your consent preferences history
- README.txt: This file

Data Summary:
-------------
- Total Chatbots: ${userData.exportMetadata.totalChatbots}
- Total Conversations: ${userData.exportMetadata.totalConversations}
- Total Analytics Records: ${userData.exportMetadata.totalAnalyticsRecords}
- Account Created: ${userData.user.created_at}

Data Retention Policies:
------------------------
- User account data: Retained until account deletion
- Chatbot data: Retained until chatbot/account deletion
- Conversation history: Retained until chatbot/account deletion
- Analytics events: 90 days
- Analytics sessions: 1 year
- Billing records: 7 years (legal requirement)

Your Rights:
------------
Under GDPR, you have the following rights:
- Right to Access: Request a copy of your data (this export)
- Right to Rectification: Correct inaccurate data
- Right to Erasure: Request deletion of your data
- Right to Restriction: Limit how we process your data
- Right to Data Portability: Receive your data in a portable format
- Right to Object: Object to certain data processing
- Right to Withdraw Consent: Withdraw consent at any time

To exercise any of these rights, please:
- Use the settings page in your ConvoAI dashboard
- Contact us at: privacy@convoai.com

Download Link Expiration:
-------------------------
This export link expires 7 days from generation for security reasons.
If the link expires, you can request a new export from your dashboard.

Questions or Concerns:
----------------------
For privacy-related questions or to exercise your rights, contact:
- Email: privacy@convoai.com
- Website: https://convoai.com/privacy-policy

This export was generated automatically by ConvoAI's GDPR compliance system.
  `.trim();
}

/**
 * Generate HTML report for human readability
 */
function generateHtmlReport(userData: UserData): string {
  const conversationsHtml = userData.conversations.slice(0, 100).map(conv => `
    <div style="margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 5px;">
      <strong>Chatbot:</strong> ${conv.chatbot_name}<br>
      <strong>Session ID:</strong> ${conv.session_id}<br>
      <strong>Date:</strong> ${new Date(conv.created_at).toLocaleString()}<br>
      <strong>Messages:</strong> ${JSON.parse(conv.messages).length}
      <details>
        <summary>View Messages</summary>
        <pre style="white-space: pre-wrap;">${JSON.stringify(JSON.parse(conv.messages), null, 2)}</pre>
      </details>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>ConvoAI Data Export - ${userData.user.email}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #fff; }
    h1 { color: #333; border-bottom: 3px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; border-bottom: 2px solid #ddd; padding-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #007bff; color: white; font-weight: bold; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .metadata { background: #e3f2fd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 3px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Your ConvoAI Data Export</h1>

  <div class="metadata">
    <strong>Export Date:</strong> ${new Date().toISOString()}<br>
    <strong>User ID:</strong> ${userData.user.id}<br>
    <strong>Email:</strong> ${userData.user.email}<br>
    <strong>Account Created:</strong> ${new Date(userData.user.created_at).toLocaleString()}
  </div>

  <div class="warning">
    <strong>⚠️ Important:</strong> This export link expires 7 days from generation.
    This document contains sensitive personal information. Please store it securely.
  </div>

  <h2>Summary</h2>
  <table>
    <tr><th>Data Type</th><th>Count</th></tr>
    <tr><td>Chatbots</td><td>${userData.chatbots.length}</td></tr>
    <tr><td>Conversations</td><td>${userData.conversations.length}</td></tr>
    <tr><td>Analytics Sessions</td><td>${userData.analytics.sessions.length}</td></tr>
    <tr><td>Analytics Events (90 days)</td><td>${userData.analytics.events.length}</td></tr>
    <tr><td>Consent Records</td><td>${userData.consents.length}</td></tr>
  </table>

  <h2>Chatbots (${userData.chatbots.length})</h2>
  <table>
    <tr>
      <th>Name</th>
      <th>Website</th>
      <th>Status</th>
      <th>Created</th>
      <th>Last Scraped</th>
    </tr>
    ${userData.chatbots.map(cb => `
      <tr>
        <td>${cb.name}</td>
        <td>${cb.website_url}</td>
        <td>${cb.status}</td>
        <td>${new Date(cb.created_at).toLocaleDateString()}</td>
        <td>${cb.last_scraped_at ? new Date(cb.last_scraped_at).toLocaleDateString() : 'Never'}</td>
      </tr>
    `).join('')}
  </table>

  <h2>Conversations (${userData.conversations.length > 100 ? 'Showing first 100' : userData.conversations.length})</h2>
  ${conversationsHtml}

  <h2>Subscription</h2>
  <table>
    <tr><th>Plan</th><td>${userData.subscription?.plan_type || 'Free'}</td></tr>
    <tr><th>Status</th><td>${userData.subscription?.status || 'N/A'}</td></tr>
    <tr><th>Start Date</th><td>${userData.subscription?.start_date ? new Date(userData.subscription.start_date).toLocaleDateString() : 'N/A'}</td></tr>
    <tr><th>Messages Used</th><td>${userData.subscription?.messages_count || 0}</td></tr>
    <tr><th>Chatbots Used</th><td>${userData.subscription?.chatbots_count || 0}</td></tr>
  </table>

  <h2>Consent Preferences</h2>
  <table>
    <tr>
      <th>Type</th>
      <th>Granted</th>
      <th>Date</th>
      <th>Withdrawn</th>
      <th>Version</th>
    </tr>
    ${userData.consents.map(c => `
      <tr>
        <td>${c.consent_type}</td>
        <td>${c.granted ? 'Yes' : 'No'}</td>
        <td>${new Date(c.granted_at).toLocaleString()}</td>
        <td>${c.withdrawn_at ? new Date(c.withdrawn_at).toLocaleString() : 'No'}</td>
        <td>${c.consent_version}</td>
      </tr>
    `).join('')}
  </table>

  <h2>Analytics Summary</h2>
  <p>Total Sessions: ${userData.analytics.sessions.length} (up to 1 year)</p>
  <p>Total Events: ${userData.analytics.events.length} (last 90 days)</p>

  <hr style="margin-top: 40px;">
  <p style="text-align: center; color: #666; font-size: 12px;">
    This export was generated by ConvoAI's GDPR compliance system.<br>
    For questions or to exercise your rights, contact: privacy@convoai.com<br>
    Generated: ${new Date().toISOString()}
  </p>
</body>
</html>
  `.trim();
}

// Event handlers
dataExportWorker.on('completed', (job) => {
  logger.info('Data export job completed', { jobId: job.id, result: job.returnvalue });
});

dataExportWorker.on('failed', (job, err) => {
  logger.error('Data export job failed', { jobId: job?.id, error: err.message });
});

export default dataExportWorker;
