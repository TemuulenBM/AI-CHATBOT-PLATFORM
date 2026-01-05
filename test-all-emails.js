/**
 * Test All Email Templates
 * Run with: node test-all-emails.js your-email@example.com
 */

import 'dotenv/config';
import EmailService from './server/services/email.ts';

const testEmail = process.argv[2];

if (!testEmail) {
  console.error('\n❌ Please provide your email address:');
  console.log('   node test-all-emails.js your-email@example.com\n');
  process.exit(1);
}

console.log('\n📧 Testing all email templates...');
console.log(`   Sending to: ${testEmail}\n`);

async function testAllEmails() {
  const results = [];

  try {
    // 1. Welcome Email
    console.log('1️⃣  Sending Welcome Email...');
    const welcome = await EmailService.sendWelcomeEmail(testEmail, 'Test User');
    results.push({ name: 'Welcome Email', success: welcome.success, messageId: welcome.messageId });
    console.log(welcome.success ? '   ✅ Sent!' : '   ❌ Failed');
    await sleep(1000);

    // 2. Subscription Confirmation
    console.log('\n2️⃣  Sending Subscription Confirmation...');
    const subscription = await EmailService.sendSubscriptionConfirmation(
      testEmail,
      'Growth Plan',
      '$29.99/month'
    );
    results.push({ name: 'Subscription Confirmation', success: subscription.success, messageId: subscription.messageId });
    console.log(subscription.success ? '   ✅ Sent!' : '   ❌ Failed');
    await sleep(1000);

    // 3. Data Export Ready
    console.log('\n3️⃣  Sending Data Export Ready Email...');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const dataExport = await EmailService.sendDataExportEmail(
      testEmail,
      'https://example.com/download/test-export-123',
      expiresAt
    );
    results.push({ name: 'Data Export Ready', success: dataExport.success, messageId: dataExport.messageId });
    console.log(dataExport.success ? '   ✅ Sent!' : '   ❌ Failed');
    await sleep(1000);

    // 4. Account Deletion Confirmation
    console.log('\n4️⃣  Sending Account Deletion Confirmation...');
    const deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const deletion = await EmailService.sendAccountDeletionConfirmation(
      testEmail,
      'Test User',
      deletionDate
    );
    results.push({ name: 'Account Deletion', success: deletion.success, messageId: deletion.messageId });
    console.log(deletion.success ? '   ✅ Sent!' : '   ❌ Failed');
    await sleep(1000);

    // 5. Training Complete
    console.log('\n5️⃣  Sending Training Complete Email...');
    const training = await EmailService.sendTrainingCompleteEmail(
      testEmail,
      'My Test Chatbot',
      1234
    );
    results.push({ name: 'Training Complete', success: training.success, messageId: training.messageId });
    console.log(training.success ? '   ✅ Sent!' : '   ❌ Failed');
    await sleep(1000);

    // 6. Usage Limit Warning (80%)
    console.log('\n6️⃣  Sending Usage Limit Warning (80%)...');
    const warning80 = await EmailService.sendUsageLimitWarning(
      testEmail,
      800,
      1000,
      'messages'
    );
    results.push({ name: 'Usage Warning 80%', success: warning80.success, messageId: warning80.messageId });
    console.log(warning80.success ? '   ✅ Sent!' : '   ❌ Failed');
    await sleep(1000);

    // 7. Usage Limit Warning (100%)
    console.log('\n7️⃣  Sending Usage Limit Warning (100%)...');
    const warning100 = await EmailService.sendUsageLimitWarning(
      testEmail,
      1000,
      1000,
      'messages'
    );
    results.push({ name: 'Usage Warning 100%', success: warning100.success, messageId: warning100.messageId });
    console.log(warning100.success ? '   ✅ Sent!' : '   ❌ Failed');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n✅ Successful: ${successful}/${results.length}`);
    console.log(`❌ Failed: ${failed}/${results.length}\n`);

    results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      const msgId = result.messageId ? ` (ID: ${result.messageId})` : '';
      console.log(`${index + 1}. ${status} ${result.name}${msgId}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`📬 Check your inbox at: ${testEmail}`);
    console.log('   (Check spam folder if you don\'t see them)');
    console.log('='.repeat(60));
    console.log('\n🎉 All email tests completed!\n');

    if (failed > 0) {
      console.log('⚠️  Some emails failed to send. Check the errors above.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testAllEmails();
