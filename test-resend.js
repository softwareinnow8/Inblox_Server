import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const testResendConnection = async () => {
  console.log('🔍 Testing Resend Configuration...\n');
  
  // Check API Key
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;
  
  console.log('1. Environment Variables:');
  console.log(`   RESEND_API_KEY: ${apiKey ? '✅ Set (' + apiKey.substring(0, 10) + '...)' : '❌ Missing'}`);
  console.log(`   EMAIL_FROM: ${emailFrom || '❌ Missing'}\n`);
  
  if (!apiKey) {
    console.error('❌ Error: RESEND_API_KEY not set in .env file');
    process.exit(1);
  }
  
  if (!apiKey.startsWith('re_')) {
    console.error('❌ Error: Invalid API key format. Should start with "re_"');
    console.error(`   Current: ${apiKey.substring(0, 10)}...`);
    process.exit(1);
  }
  
  // Test API Connection
  console.log('2. Testing Resend API Connection...');
  const resend = new Resend(apiKey);
  
  try {
    const { data, error } = await resend.emails.send({
      from: emailFrom || 'onboarding@resend.dev',
      to: [process.env.TEST_EMAIL || 'delivered@resend.dev'],
      subject: 'Test Email from Inblox Server',
      html: '<h1>✅ Email Service Working!</h1><p>Your Resend integration is configured correctly.</p>'
    });
    
    if (error) {
      console.error('❌ Error sending test email:', error);
      process.exit(1);
    }
    
    console.log('✅ Test email sent successfully!');
    console.log(`   Email ID: ${data.id}`);
    console.log(`   To: ${process.env.TEST_EMAIL || 'delivered@resend.dev'}`);
    console.log('\n🎉 Resend is configured correctly!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

testResendConnection();
