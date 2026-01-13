import { Resend } from 'resend';
import logger from '../utils/logger';

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export class EmailService {
  private static readonly DEFAULT_FROM = process.env.EMAIL_FROM || 'noreply@yourdomain.com';

  /**
   * Send a single email
   */
  static async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!process.env.RESEND_API_KEY) {
        logger.warn('RESEND_API_KEY not configured. Email not sent.', { to: options.to, subject: options.subject });
        return { success: false, error: 'Email service not configured' };
      }

      const { data, error } = await resend.emails.send({
        from: options.from || EmailService.DEFAULT_FROM,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
      });

      if (error) {
        logger.error('Failed to send email', { error, to: options.to, subject: options.subject });
        return { success: false, error: error.message };
      }

      logger.info('Email sent successfully', { messageId: data?.id, to: options.to, subject: options.subject });
      return { success: true, messageId: data?.id };
    } catch (error) {
      logger.error('Unexpected error sending email', { error, to: options.to, subject: options.subject });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Send welcome email to new users
   */
  static async sendWelcomeEmail(to: string, userName: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to ConvoAI!</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>Welcome to ConvoAI - your AI-powered chatbot platform for automating customer support!</p>
              <p>We're excited to have you on board. Here's what you can do next:</p>
              <ul>
                <li>Create your first chatbot</li>
                <li>Train it with your website content</li>
                <li>Embed the widget on your site</li>
                <li>Start automating customer support</li>
              </ul>
              <a href="${process.env.APP_URL}/dashboard" class="button">Get Started</a>
              <p>If you have any questions, feel free to reach out to our support team.</p>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: 'Welcome to ConvoAI!',
      html,
    });
  }

  /**
   * Send subscription confirmation email
   */
  static async sendSubscriptionConfirmation(to: string, planName: string, amount: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .plan-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Subscription Confirmed!</h1>
            </div>
            <div class="content">
              <p>Thank you for subscribing to ConvoAI!</p>
              <div class="plan-details">
                <h2>Plan Details</h2>
                <p><strong>Plan:</strong> ${planName}</p>
                <p><strong>Amount:</strong> ${amount}</p>
              </div>
              <p>Your subscription is now active and you have full access to all ${planName} features.</p>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: `Subscription Confirmed - ${planName}`,
      html,
    });
  }

  /**
   * Send GDPR data export email
   */
  static async sendDataExportEmail(to: string, downloadUrl: string, expiresAt: Date): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Data Export is Ready</h1>
            </div>
            <div class="content">
              <p>Your requested data export is now ready for download.</p>
              <a href="${downloadUrl}" class="button">Download Your Data</a>
              <div class="warning">
                <strong>Important:</strong> This download link will expire on ${expiresAt.toLocaleDateString()} at ${expiresAt.toLocaleTimeString()}.
              </div>
              <p>The export includes all your personal data stored in our system in JSON format.</p>
              <p>If you have any questions, please contact our support team.</p>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: 'Your Data Export is Ready - ConvoAI',
      html,
    });
  }

  /**
   * Send account deletion confirmation email
   */
  static async sendAccountDeletionConfirmation(to: string, userName: string, deletionDate: Date): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .warning { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Account Deletion Scheduled</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>We've received your request to delete your ConvoAI account.</p>
              <div class="warning">
                <strong>Scheduled Deletion:</strong> Your account will be permanently deleted on ${deletionDate.toLocaleDateString()} at ${deletionDate.toLocaleTimeString()}.
              </div>
              <p>What this means:</p>
              <ul>
                <li>All your chatbots will be deleted</li>
                <li>All training data and conversations will be removed</li>
                <li>Your subscription will be cancelled</li>
                <li>This action cannot be undone</li>
              </ul>
              <p>If you did not request this deletion or changed your mind, please contact our support team immediately.</p>
              <p>We're sorry to see you go.</p>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: 'Account Deletion Scheduled - ConvoAI',
      html,
    });
  }

  /**
   * Send password reset email (if you implement custom auth later)
   */
  static async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Reset Your Password</h1>
            </div>
            <div class="content">
              <p>We received a request to reset your password for your ConvoAI account.</p>
              <a href="${resetUrl}" class="button">Reset Password</a>
              <div class="warning">
                <strong>Security Notice:</strong> This link will expire in 1 hour. If you didn't request this reset, please ignore this email.
              </div>
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: 'Reset Your Password - ConvoAI',
      html,
    });
  }

  /**
   * Send notification when chatbot training is complete
   */
  static async sendTrainingCompleteEmail(to: string, chatbotName: string, totalEmbeddings: number): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .stats { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Training Complete!</h1>
            </div>
            <div class="content">
              <p>Great news! Your chatbot "${chatbotName}" has finished training.</p>
              <div class="stats">
                <h3>Training Results</h3>
                <p><strong>Total knowledge items processed:</strong> ${totalEmbeddings.toLocaleString()}</p>
                <p>Your chatbot is now ready to answer customer questions based on your content.</p>
              </div>
              <a href="${process.env.APP_URL}/dashboard/chatbots" class="button">View Your Chatbot</a>
              <p>Next steps:</p>
              <ul>
                <li>Test your chatbot with sample questions</li>
                <li>Customize the appearance and behavior</li>
                <li>Deploy the widget to your website</li>
              </ul>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: `Training Complete - ${chatbotName}`,
      html,
    });
  }

  /**
   * Send account deletion completed email (GDPR Article 17 compliance)
   */
  static async sendAccountDeletionCompleted(to: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Account Deletion Completed</h1>
            </div>
            <div class="content">
              <p>Your ConvoAI account has been permanently deleted as requested.</p>
              <div class="info-box">
                <strong>What was deleted:</strong>
                <ul style="margin: 10px 0;">
                  <li>All chatbots and training data</li>
                  <li>All conversations and messages</li>
                  <li>Personal information and settings</li>
                  <li>Analytics and usage data</li>
                </ul>
              </div>
              <p><strong>Data Retention:</strong> Some billing records may be retained for 7 years as required by tax and accounting regulations, but all personally identifiable information has been anonymized.</p>
              <p>This email serves as confirmation that your GDPR Right to Erasure request has been fulfilled.</p>
              <p>If you have any questions or believe this was done in error, please contact our support team.</p>
              <p>Thank you for using ConvoAI.</p>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: 'Account Deletion Completed - ConvoAI',
      html,
    });
  }

  /**
   * Send usage limit warning email
   */
  static async sendUsageLimitWarning(to: string, currentUsage: number, limit: number, resourceType: string): Promise<void> {
    const percentUsed = Math.round((currentUsage / limit) * 100);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .usage-bar { background: #e5e7eb; height: 30px; border-radius: 15px; overflow: hidden; margin: 20px 0; }
            .usage-fill { background: linear-gradient(90deg, #f59e0b 0%, #ef4444 100%); height: 100%; transition: width 0.3s; }
            .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Usage Limit Warning</h1>
            </div>
            <div class="content">
              <p>You're approaching your ${resourceType} limit for this billing period.</p>
              <div class="usage-bar">
                <div class="usage-fill" style="width: ${percentUsed}%"></div>
              </div>
              <p style="text-align: center; font-size: 18px;"><strong>${percentUsed}% Used</strong> (${currentUsage.toLocaleString()} / ${limit.toLocaleString()})</p>
              <p>Consider upgrading your plan to avoid service interruptions.</p>
              <a href="${process.env.APP_URL}/dashboard/settings/billing" class="button">Upgrade Plan</a>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: `Usage Limit Warning - ${resourceType}`,
      html,
    });
  }

  /**
   * Send subscription cancellation email
   */
  static async sendSubscriptionCanceled(to: string, planName: string, cancelDate: Date): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Subscription Canceled</h1>
            </div>
            <div class="content">
              <p>Your ${planName} subscription has been canceled.</p>
              <div class="info-box">
                <strong>Cancellation Details:</strong>
                <ul style="margin: 10px 0;">
                  <li>Plan: ${planName}</li>
                  <li>Canceled on: ${cancelDate.toLocaleDateString()}</li>
                  <li>Your account has been downgraded to the Free plan</li>
                </ul>
              </div>
              <p>You still have access to basic features on the Free plan:</p>
              <ul>
                <li>Up to 3 chatbots</li>
                <li>500 messages per month</li>
                <li>Basic analytics</li>
              </ul>
              <p>If you'd like to resubscribe at any time, you can do so from your dashboard.</p>
              <a href="${process.env.APP_URL}/dashboard/settings/billing" class="button">Manage Subscription</a>
              <p>We're sorry to see you go. If you have feedback on how we can improve, please let us know.</p>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: `Subscription Canceled - ${planName}`,
      html,
    });
  }

  /**
   * Send subscription past due warning
   */
  static async sendSubscriptionPastDue(to: string, planName: string, dueDate: Date): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
            .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Past Due - Action Required</h1>
            </div>
            <div class="content">
              <p>We were unable to process your payment for your ${planName} subscription.</p>
              <div class="warning-box">
                <strong>⚠️ Action Required:</strong>
                <p style="margin: 10px 0;">Your payment is past due. Please update your payment method to avoid service interruption.</p>
                <p style="margin: 10px 0;"><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</p>
              </div>
              <p>What happens next:</p>
              <ul>
                <li>We'll retry the payment automatically</li>
                <li>If payment fails again, your subscription may be canceled</li>
                <li>You'll be downgraded to the Free plan</li>
              </ul>
              <a href="${process.env.APP_URL}/dashboard/settings/billing" class="button">Update Payment Method</a>
              <p>If you have questions or need assistance, please contact our support team.</p>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: 'Payment Past Due - Action Required',
      html,
    });
  }

  /**
   * Send payment failed notification
   */
  static async sendPaymentFailed(to: string, planName: string, amount: string, retryDate?: Date): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .error-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
            .button { display: inline-block; background: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Failed</h1>
            </div>
            <div class="content">
              <p>We were unable to process your payment for your ${planName} subscription.</p>
              <div class="error-box">
                <strong>❌ Payment Failed:</strong>
                <ul style="margin: 10px 0;">
                  <li><strong>Plan:</strong> ${planName}</li>
                  <li><strong>Amount:</strong> ${amount}</li>
                  ${retryDate ? `<li><strong>Next Retry:</strong> ${retryDate.toLocaleDateString()}</li>` : ''}
                </ul>
              </div>
              <p>Common reasons for payment failure:</p>
              <ul>
                <li>Insufficient funds</li>
                <li>Card expired or invalid</li>
                <li>Payment method declined by bank</li>
                <li>Billing address mismatch</li>
              </ul>
              <p>Please update your payment method to continue using ${planName} features.</p>
              <a href="${process.env.APP_URL}/dashboard/settings/billing" class="button">Update Payment Method</a>
              <p>If the issue persists, please contact your bank or our support team for assistance.</p>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ConvoAI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: `Payment Failed - ${planName}`,
      html,
    });
  }

  /**
   * Send critical admin alert
   */
  static async sendAdminAlert(
    to: string | string[],
    alertType: string,
    message: string,
    details?: Record<string, any>
  ): Promise<void> {
    const detailsHtml = details
      ? `
        <div class="details">
          <h3>Details:</h3>
          <pre>${JSON.stringify(details, null, 2)}</pre>
        </div>
      `
      : '';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Courier New', monospace; line-height: 1.6; color: #333; background: #1a1a1a; }
            .container { max-width: 700px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; border-radius: 5px 5px 0 0; border-left: 5px solid #991b1b; }
            .content { background: #2d2d2d; color: #e5e5e5; padding: 30px; border-radius: 0 0 5px 5px; }
            .alert-type { background: #991b1b; color: white; padding: 5px 10px; border-radius: 3px; display: inline-block; margin-bottom: 15px; }
            .details { background: #1a1a1a; padding: 15px; border-radius: 3px; margin: 20px 0; overflow-x: auto; }
            .details pre { color: #10b981; margin: 0; font-size: 12px; }
            .timestamp { color: #9ca3af; font-size: 14px; }
            .footer { text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">🚨 CRITICAL ALERT</h1>
            </div>
            <div class="content">
              <div class="alert-type">${alertType}</div>
              <h2 style="color: #fbbf24; margin-top: 0;">${message}</h2>
              ${detailsHtml}
              <p class="timestamp">Timestamp: ${new Date().toISOString()}</p>
              <p style="border-top: 1px solid #4b5563; padding-top: 15px; margin-top: 20px;">
                This is an automated alert from ConvoAI monitoring system. Please investigate immediately.
              </p>
            </div>
            <div class="footer">
              <p>ConvoAI Admin Alert System</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to,
      subject: `[CRITICAL] ${alertType} - ${message}`,
      html,
      from: process.env.EMAIL_FROM_ALERTS || process.env.EMAIL_FROM,
    });
  }

  /**
   * Send Redis quota exceeded notification
   */
  static async sendRedisQuotaExceeded(to: string | string[]): Promise<void> {
    await this.sendAdminAlert(
      to,
      'Redis Quota Exceeded',
      'Redis quota limit exceeded - features degraded',
      {
        affectedFeatures: ['Rate limiting', 'Caching', 'Job queues', 'Session storage'],
        action: 'Upgrade Upstash Redis plan or optimize usage',
        impact: 'HIGH - Core features may be degraded or unavailable',
        urgency: 'IMMEDIATE ACTION REQUIRED',
      }
    );
  }
}

export default EmailService;
