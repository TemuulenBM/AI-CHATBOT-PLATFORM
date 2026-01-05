/**
 * Quick Email Test Script
 * Run with: node test-email.js your-email@example.com
 */

import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
  const testEmail = process.argv[2];

  if (!testEmail) {
    console.error('\n❌ Please provide your email address:');
    console.log('   node test-email.js your-email@example.com\n');
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('\n❌ RESEND_API_KEY not found in .env file\n');
    process.exit(1);
  }

  if (!process.env.EMAIL_FROM) {
    console.error('\n❌ EMAIL_FROM not found in .env file\n');
    process.exit(1);
  }

  console.log('\n📧 Testing email service...');
  console.log('   From:', process.env.EMAIL_FROM);
  console.log('   To:', testEmail);
  console.log('   API Key:', process.env.RESEND_API_KEY.substring(0, 10) + '...\n');

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: testEmail,
      subject: '🎉 Email Service Test - ConvoAI',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
              .code { background: #f5f5f5; padding: 10px; border-radius: 5px; font-family: monospace; }
              .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✅ Email Service Working!</h1>
              </div>
              <div class="content">
                <div class="success">
                  <strong>Success!</strong> Your ConvoAI email notification service is now configured and working.
                </div>

                <h2>Configuration</h2>
                <div class="code">
                  RESEND_API_KEY: ${process.env.RESEND_API_KEY.substring(0, 15)}...<br>
                  EMAIL_FROM: ${process.env.EMAIL_FROM}
                </div>

                <h2>What's Next?</h2>
                <p>Your platform will now automatically send emails for:</p>
                <ul>
                  <li>✅ GDPR Data Export Ready</li>
                  <li>✅ Account Deletion Confirmation</li>
                  <li>📧 Welcome Emails (ready to integrate)</li>
                  <li>📧 Subscription Confirmations (ready to integrate)</li>
                  <li>📧 Chatbot Training Complete (ready to integrate)</li>
                  <li>📧 Usage Limit Warnings (ready to integrate)</li>
                </ul>

                <h2>Free Tier</h2>
                <p>You're on the <strong>FREE plan</strong> with:</p>
                <ul>
                  <li>100 emails/day</li>
                  <li>No credit card required</li>
                  <li>All features included</li>
                </ul>

                <h2>Documentation</h2>
                <p>Check these files for more information:</p>
                <ul>
                  <li><code>QUICK_START_EMAIL.md</code> - Quick start guide</li>
                  <li><code>EMAIL_SETUP_GUIDE.md</code> - Complete setup guide</li>
                  <li><code>EMAIL_INTEGRATION_EXAMPLES.md</code> - Integration examples</li>
                </ul>

                <p>Happy emailing! 🎉</p>
                <p>- The ConvoAI Team</p>
              </div>
              <div class="footer">
                <p>This is a test email from your ConvoAI platform</p>
                <p>Generated: ${new Date().toISOString()}</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('❌ Email failed to send:');
      console.error('   Error:', error.message);
      console.error('\n💡 Common issues:');
      console.error('   - Check your API key is correct');
      console.error('   - Make sure EMAIL_FROM is set to "onboarding@resend.dev" for testing');
      console.error('   - Verify your email address in Resend dashboard\n');
      process.exit(1);
    }

    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', data.id);
    console.log('\n📬 Check your inbox at:', testEmail);
    console.log('   (Check spam folder if you don\'t see it)\n');
    console.log('🎉 Your email service is ready to use!\n');
  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testEmail();
