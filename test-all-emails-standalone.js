/**
 * Standalone Email Template Tests
 * Tests all 7 email templates by sending them directly via Resend
 * Run with: node test-all-emails-standalone.js your-email@example.com
 */

import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const testEmail = process.argv[2];
const emailFrom = process.env.EMAIL_FROM || 'onboarding@resend.dev';

if (!testEmail) {
  console.error('\n❌ Please provide your email address:');
  console.log('   node test-all-emails-standalone.js your-email@example.com\n');
  process.exit(1);
}

console.log('\n📧 Testing all 7 email templates...');
console.log(`   From: ${emailFrom}`);
console.log(`   To: ${testEmail}\n`);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendEmail(subject, html) {
  try {
    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: testEmail,
      subject,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testAllEmails() {
  const results = [];

  // 1. WELCOME EMAIL
  console.log('1️⃣  Welcome Email...');
  const welcome = await sendEmail(
    'Welcome to ConvoAI!',
    `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>Welcome to ConvoAI!</h1></div>
            <div class="content">
              <p>Hi Test User,</p>
              <p>Welcome to ConvoAI - your AI-powered chatbot platform!</p>
              <a href="${process.env.APP_URL}/dashboard" class="button">Get Started</a>
              <p>Best regards,<br>The ConvoAI Team</p>
            </div>
          </div>
        </body>
      </html>
    `
  );
  results.push({ name: 'Welcome Email', ...welcome });
  console.log(welcome.success ? '   ✅ Sent!\n' : `   ❌ Failed: ${welcome.error}\n`);
  await sleep(1000);

  // 2. SUBSCRIPTION CONFIRMATION
  console.log('2️⃣  Subscription Confirmation...');
  const subscription = await sendEmail(
    'Subscription Confirmed - Growth Plan',
    `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .plan-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>Subscription Confirmed!</h1></div>
            <div class="content">
              <p>Thank you for subscribing to ConvoAI!</p>
              <div class="plan-details">
                <h2>Plan Details</h2>
                <p><strong>Plan:</strong> Growth Plan</p>
                <p><strong>Amount:</strong> $29.99/month</p>
              </div>
              <p>Your subscription is now active!</p>
            </div>
          </div>
        </body>
      </html>
    `
  );
  results.push({ name: 'Subscription Confirmation', ...subscription });
  console.log(subscription.success ? '   ✅ Sent!\n' : `   ❌ Failed: ${subscription.error}\n`);
  await sleep(1000);

  // 3. DATA EXPORT READY
  console.log('3️⃣  Data Export Ready...');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const dataExport = await sendEmail(
    'Your Data Export is Ready - ConvoAI',
    `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>Your Data Export is Ready</h1></div>
            <div class="content">
              <p>Your requested data export is now ready for download.</p>
              <a href="https://example.com/download/test" class="button">Download Your Data</a>
              <div class="warning">
                <strong>Important:</strong> This download link will expire on ${expiresAt.toLocaleDateString()}.
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  );
  results.push({ name: 'Data Export Ready', ...dataExport });
  console.log(dataExport.success ? '   ✅ Sent!\n' : `   ❌ Failed: ${dataExport.error}\n`);
  await sleep(1000);

  // 4. ACCOUNT DELETION
  console.log('4️⃣  Account Deletion Confirmation...');
  const deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const deletion = await sendEmail(
    'Account Deletion Scheduled - ConvoAI',
    `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .warning { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>Account Deletion Scheduled</h1></div>
            <div class="content">
              <p>Hi Test User,</p>
              <p>We've received your request to delete your ConvoAI account.</p>
              <div class="warning">
                <strong>Scheduled Deletion:</strong> Your account will be permanently deleted on ${deletionDate.toLocaleDateString()}.
              </div>
              <p>This action cannot be undone.</p>
            </div>
          </div>
        </body>
      </html>
    `
  );
  results.push({ name: 'Account Deletion', ...deletion });
  console.log(deletion.success ? '   ✅ Sent!\n' : `   ❌ Failed: ${deletion.error}\n`);
  await sleep(1000);

  // 5. TRAINING COMPLETE
  console.log('5️⃣  Training Complete...');
  const training = await sendEmail(
    'Training Complete - My Test Chatbot',
    `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .stats { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>Training Complete!</h1></div>
            <div class="content">
              <p>Great news! Your chatbot "My Test Chatbot" has finished training.</p>
              <div class="stats">
                <h3>Training Results</h3>
                <p><strong>Total knowledge items processed:</strong> 1,234</p>
              </div>
              <a href="${process.env.APP_URL}/dashboard/chatbots" class="button">View Your Chatbot</a>
              <p>Your chatbot is now ready to answer customer questions!</p>
            </div>
          </div>
        </body>
      </html>
    `
  );
  results.push({ name: 'Training Complete', ...training });
  console.log(training.success ? '   ✅ Sent!\n' : `   ❌ Failed: ${training.error}\n`);
  await sleep(1000);

  // 6. USAGE WARNING (80%)
  console.log('6️⃣  Usage Limit Warning (80%)...');
  const warning80 = await sendEmail(
    'Usage Limit Warning - messages',
    `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .usage-bar { background: #e5e7eb; height: 30px; border-radius: 15px; overflow: hidden; margin: 20px 0; }
            .usage-fill { background: linear-gradient(90deg, #f59e0b 0%, #ef4444 100%); height: 100%; }
            .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>Usage Limit Warning</h1></div>
            <div class="content">
              <p>You're approaching your messages limit for this billing period.</p>
              <div class="usage-bar">
                <div class="usage-fill" style="width: 80%"></div>
              </div>
              <p style="text-align: center; font-size: 18px;"><strong>80% Used</strong> (800 / 1,000)</p>
              <a href="${process.env.APP_URL}/dashboard/settings/billing" class="button">Upgrade Plan</a>
            </div>
          </div>
        </body>
      </html>
    `
  );
  results.push({ name: 'Usage Warning 80%', ...warning80 });
  console.log(warning80.success ? '   ✅ Sent!\n' : `   ❌ Failed: ${warning80.error}\n`);
  await sleep(1000);

  // 7. USAGE WARNING (100%)
  console.log('7️⃣  Usage Limit Warning (100%)...');
  const warning100 = await sendEmail(
    'Usage Limit Reached - messages',
    `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .usage-bar { background: #e5e7eb; height: 30px; border-radius: 15px; overflow: hidden; margin: 20px 0; }
            .usage-fill { background: #ef4444; height: 100%; }
            .button { display: inline-block; background: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>⚠️ Usage Limit Reached</h1></div>
            <div class="content">
              <p>You've reached your messages limit for this billing period.</p>
              <div class="usage-bar">
                <div class="usage-fill" style="width: 100%"></div>
              </div>
              <p style="text-align: center; font-size: 18px;"><strong>100% Used</strong> (1,000 / 1,000)</p>
              <p>Please upgrade your plan to continue using the service.</p>
              <a href="${process.env.APP_URL}/dashboard/settings/billing" class="button">Upgrade Now</a>
            </div>
          </div>
        </body>
      </html>
    `
  );
  results.push({ name: 'Usage Warning 100%', ...warning100 });
  console.log(warning100.success ? '   ✅ Sent!\n' : `   ❌ Failed: ${warning100.error}\n`);

  // SUMMARY
  console.log('='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n✅ Successful: ${successful}/7`);
  console.log(`❌ Failed: ${failed}/7\n`);

  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const detail = result.success
      ? `(ID: ${result.messageId.substring(0, 20)}...)`
      : `(Error: ${result.error})`;
    console.log(`${index + 1}. ${status} ${result.name.padEnd(30)} ${detail}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log(`📬 Check your inbox at: ${testEmail}`);
  console.log('   You should see 7 emails (check spam folder)');
  console.log('='.repeat(60));
  console.log('\n🎉 Email test completed!\n');

  if (failed > 0) {
    console.log('⚠️  Some emails failed. Check Resend dashboard or API key.\n');
    process.exit(1);
  }
}

testAllEmails().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
