// import { Resend } from 'resend';
import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender email (must be verified in Resend)
const FROM_EMAIL = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const APP_NAME = process.env.APP_NAME || 'Inblox';
const BACKEND_URL = process.env.BACKEND_URL || process.env.API_BASE_URL || `http://localhost:3001`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Send verification email
const sendVerificationEmail = async (email, verificationToken, firstName) => {
  try {
    // Directly hit backend API to verify on click
    const verificationUrl = `${BACKEND_URL}/api/auth/verify-email/${verificationToken}`;
    
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: [email],
      subject: 'Verify Your Email Address',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            :root {
              color-scheme: light;
            }
            body {
              margin: 0;
              padding: 0;
              background: #f5f7fb;
              font-family: "Helvetica Neue", Arial, sans-serif;
              color: #1f2933;
              line-height: 1.6;
            }
            .card {
              max-width: 640px;
              margin: 32px auto;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
              border: 1px solid #eef1f6;
            }
            .header {
              background: linear-gradient(135deg, #fca72c 0%, #f36c21 100%);
              color: #ffffff;
              padding: 28px 32px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              letter-spacing: 0.3px;
            }
            .body {
              padding: 30px 32px 24px;
              background: #ffffff;
            }
            h2 {
              margin: 0 0 12px;
              font-size: 18px;
              color: #111827;
            }
            p {
              margin: 0 0 14px;
              color: #374151;
              font-size: 15px;
            }
            .cta {
              display: inline-block;
              margin: 18px 0 14px;
              padding: 12px 26px;
              background: #f7931d;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 10px;
              font-weight: 700;
              letter-spacing: 0.2px;
              box-shadow: 0 8px 20px rgba(247, 147, 29, 0.35);
            }
            .link {
              color: #f36c21;
              word-break: break-all;
              font-weight: 600;
            }
            .note {
              margin: 18px 0;
              padding: 12px 14px;
              background: #fff4e6;
              border-left: 4px solid #f7931d;
              border-radius: 8px;
              color: #9a5b16;
              font-size: 14px;
            }
            .footer {
              padding: 18px 24px 24px;
              text-align: center;
              color: #6b7280;
              font-size: 13px;
              background: #f9fafb;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>Welcome to ${APP_NAME}!</h1>
            </div>
            <div class="body">
              <h2>Hi ${firstName},</h2>
              <p>Thanks for joining ${APP_NAME}. Verify your email to start building amazing projects.</p>
              <p>Tap the button below to verify:</p>
              <div style="text-align: center;">
                <a class="cta" href="${verificationUrl}">Verify Email</a>
              </div>
              <p style="margin-top: 6px;">Or copy this link:</p>
              <p class="link">${verificationUrl}</p>
              <div class="note">
                <strong>Expires in 24 hours.</strong> If you didn’t sign up, you can ignore this email.
              </div>
            </div>
            <div class="footer">
              &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending verification email:', error);
      throw error;
    }

    console.log('Verification email sent:', data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};

// Send admin invite email
const sendInviteEmail = async (email, verificationToken, inviterName) => {
  try {
    const inviteUrl = `${FRONTEND_URL}/#/accept-invite?token=${verificationToken}`;
    const safeInviter = inviterName || "Admin";

    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: [email],
      subject: `You are invited to join ${APP_NAME}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            :root {
              color-scheme: light;
            }
            body {
              margin: 0;
              padding: 0;
              background: #f5f7fb;
              font-family: "Helvetica Neue", Arial, sans-serif;
              color: #1f2933;
              line-height: 1.6;
            }
            .card {
              max-width: 640px;
              margin: 32px auto;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
              border: 1px solid #eef1f6;
            }
            .header {
              background: linear-gradient(135deg, #1a8bff 0%, #0b63ce 100%);
              color: #ffffff;
              padding: 28px 32px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              letter-spacing: 0.3px;
            }
            .body {
              padding: 30px 32px 24px;
              background: #ffffff;
            }
            h2 {
              margin: 0 0 12px;
              font-size: 18px;
              color: #111827;
            }
            p {
              margin: 0 0 14px;
              color: #374151;
              font-size: 15px;
            }
            .cta {
              display: inline-block;
              margin: 18px 0 14px;
              padding: 12px 26px;
              background: #1a8bff;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 10px;
              font-weight: 700;
              letter-spacing: 0.2px;
              box-shadow: 0 8px 20px rgba(26, 139, 255, 0.35);
            }
            .link {
              color: #0b63ce;
              word-break: break-all;
              font-weight: 600;
            }
            .note {
              margin: 18px 0;
              padding: 12px 14px;
              background: #eaf4ff;
              border-left: 4px solid #1a8bff;
              border-radius: 8px;
              color: #1f4d7a;
              font-size: 14px;
            }
            .footer {
              padding: 18px 24px 24px;
              text-align: center;
              color: #6b7280;
              font-size: 13px;
              background: #f9fafb;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>You are invited to ${APP_NAME}</h1>
            </div>
            <div class="body">
              <h2>Welcome!</h2>
              <p>${safeInviter} invited you to join ${APP_NAME}.</p>
              <p>Click the button below to verify your email and access your account:</p>
              <div style="text-align: center;">
                <a class="cta" href="${inviteUrl}">Accept Invite</a>
              </div>
              <p style="margin-top: 6px;">Or copy this link:</p>
              <p class="link">${inviteUrl}</p>
              <div class="note">
                <strong>Expires in 24 hours.</strong> If you did not expect this invite, you can ignore this email.
              </div>
            </div>
            <div class="footer">
              &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error("Error sending invite email:", error);
      throw error;
    }

    console.log("Invite email sent:", data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error("Error sending invite email:", error);
    throw error;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken, firstName) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: [email],
      subject: 'Reset Your Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              background: #f5f7fb;
              font-family: "Helvetica Neue", Arial, sans-serif;
              color: #1f2933;
              line-height: 1.6;
            }
            .card {
              max-width: 640px;
              margin: 32px auto;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
              border: 1px solid #eef1f6;
            }
            .header {
              background: linear-gradient(135deg, #fca72c 0%, #f36c21 100%);
              color: #ffffff;
              padding: 24px 32px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 22px;
              font-weight: 700;
            }
            .body {
              padding: 30px 32px 24px;
              background: #ffffff;
            }
            h2 { margin: 0 0 12px; font-size: 18px; color: #111827; }
            p { margin: 0 0 14px; color: #374151; font-size: 15px; }
            .cta {
              display: inline-block;
              margin: 18px 0 14px;
              padding: 12px 26px;
              background: #f36c21;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 10px;
              font-weight: 700;
              letter-spacing: 0.2px;
              box-shadow: 0 8px 20px rgba(243, 108, 33, 0.35);
            }
            .link { color: #f36c21; word-break: break-all; font-weight: 600; }
            .note {
              margin: 18px 0;
              padding: 12px 14px;
              background: #fff4e6;
              border-left: 4px solid #f7931d;
              border-radius: 8px;
              color: #9a5b16;
              font-size: 14px;
            }
            .footer {
              padding: 18px 24px 24px;
              text-align: center;
              color: #6b7280;
              font-size: 13px;
              background: #f9fafb;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>Password Reset</h1>
            </div>
            <div class="body">
              <h2>Hi ${firstName},</h2>
              <p>We received a request to reset the password for your ${process.env.APP_NAME || 'Inblox'} account.</p>
              <p>Click the button below to choose a new password:</p>
              <div style="text-align: center;">
                <a class="cta" href="${resetUrl}">Reset Password</a>
              </div>
              <p style="margin-top: 6px;">Or copy this link:</p>
              <p class="link">${resetUrl}</p>
              <div class="note">
                <strong>Expires in 1 hour.</strong> If you didn’t request this, you can ignore this email and your password will stay the same.
              </div>
            </div>
            <div class="footer">
              &copy; ${new Date().getFullYear()} ${process.env.APP_NAME || 'Inblox'}. All rights reserved.
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending password reset email:', error);
      throw error;
    }

    console.log('Password reset email sent:', data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

// Send password change confirmation email
const sendPasswordChangeConfirmation = async (email, firstName) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: [email],
      subject: 'Password Changed Successfully',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              background: #f5f7fb;
              font-family: "Helvetica Neue", Arial, sans-serif;
              color: #1f2933;
              line-height: 1.6;
            }
            .card {
              max-width: 640px;
              margin: 32px auto;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
              border: 1px solid #eef1f6;
            }
            .header {
              background: linear-gradient(135deg, #fca72c 0%, #f36c21 100%);
              color: #ffffff;
              padding: 24px 32px;
              text-align: center;
            }
            .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
            .body { padding: 30px 32px 24px; background: #ffffff; }
            h2 { margin: 0 0 12px; font-size: 18px; color: #111827; }
            p { margin: 0 0 14px; color: #374151; font-size: 15px; }
            .info {
              margin: 18px 0;
              padding: 12px 14px;
              background: #fff4e6;
              border-left: 4px solid #f7931d;
              border-radius: 8px;
              color: #9a5b16;
              font-size: 14px;
            }
            .footer {
              padding: 18px 24px 24px;
              text-align: center;
              color: #6b7280;
              font-size: 13px;
              background: #f9fafb;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>Password Updated</h1>
            </div>
            <div class="body">
              <h2>Hi ${firstName},</h2>
              <p>Your password for ${process.env.APP_NAME || 'Inblox'} has been changed successfully.</p>
              <div class="info">
                <strong>Time:</strong> ${new Date().toLocaleString()}<br />
                <strong>Note:</strong> If this wasn’t you, please reset your password immediately.
              </div>
            </div>
            <div class="footer">
              &copy; ${new Date().getFullYear()} ${process.env.APP_NAME || 'Inblox'}. All rights reserved.
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending password change confirmation email:', error);
      throw error;
    }

    console.log('Password change confirmation email sent:', data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Error sending password change confirmation email:', error);
    throw error;
  }
};

// Send contact/support email notification to admin
const sendContactNotificationEmail = async (contactData) => {
  try {
    const { name, email, subject, message, category, userId } = contactData;
    const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || FROM_EMAIL;
    
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} Support <${FROM_EMAIL}>`,
      to: [SUPPORT_EMAIL],
      replyTo: email,
      subject: `[${category.toUpperCase()}] New Support Request: ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            :root {
              color-scheme: light;
            }
            body {
              margin: 0;
              padding: 0;
              background: #f5f7fb;
              font-family: "Helvetica Neue", Arial, sans-serif;
              color: #1f2933;
              line-height: 1.6;
            }
            .card {
              max-width: 640px;
              margin: 32px auto;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
              border: 1px solid #eef1f6;
            }
            .header {
              background: linear-gradient(135deg, #fca72c 0%, #f36c21 100%);
              color: #ffffff;
              padding: 28px 32px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              letter-spacing: 0.3px;
            }
            .body {
              padding: 30px 32px 24px;
              background: #ffffff;
            }
            .info-row {
              margin: 12px 0;
              padding: 10px;
              background: #f9fafb;
              border-radius: 6px;
            }
            .label {
              font-weight: 700;
              color: #374151;
              display: inline-block;
              min-width: 100px;
            }
            .value {
              color: #111827;
            }
            .message-box {
              margin: 16px 0;
              padding: 16px;
              background: #fff4e6;
              border-left: 4px solid #f7931d;
              border-radius: 8px;
              white-space: pre-wrap;
              word-wrap: break-word;
            }
            .footer {
              margin-top: 24px;
              padding-top: 16px;
              border-top: 1px solid #eef1f6;
              color: #6b7280;
              font-size: 13px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>📧 New Support Request</h1>
            </div>
            <div class="body">
              <div class="info-row">
                <span class="label">From:</span>
                <span class="value">${name}</span>
              </div>
              <div class="info-row">
                <span class="label">Email:</span>
                <span class="value">${email}</span>
              </div>
              <div class="info-row">
                <span class="label">Category:</span>
                <span class="value">${category}</span>
              </div>
              <div class="info-row">
                <span class="label">Subject:</span>
                <span class="value">${subject}</span>
              </div>
              ${userId ? `<div class="info-row"><span class="label">User ID:</span><span class="value">${userId}</span></div>` : ''}
              
              <h3 style="margin-top: 24px; color: #111827;">Message:</h3>
              <div class="message-box">${message}</div>
              
              <div class="footer">
                <strong>Note:</strong> Reply directly to this email to respond to the user.
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending contact notification email:', error);
      throw error;
    }

    console.log('Contact notification email sent:', data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Error sending contact notification email:', error);
    throw error;
  }
};

// Send confirmation email to user after contact form submission
const sendContactConfirmationEmail = async (name, email, subject) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} Support <${FROM_EMAIL}>`,
      to: [email],
      subject: `We received your message: ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            :root {
              color-scheme: light;
            }
            body {
              margin: 0;
              padding: 0;
              background: #f5f7fb;
              font-family: "Helvetica Neue", Arial, sans-serif;
              color: #1f2933;
              line-height: 1.6;
            }
            .card {
              max-width: 640px;
              margin: 32px auto;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
              border: 1px solid #eef1f6;
            }
            .header {
              background: linear-gradient(135deg, #fca72c 0%, #f36c21 100%);
              color: #ffffff;
              padding: 28px 32px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              letter-spacing: 0.3px;
            }
            .body {
              padding: 30px 32px 24px;
              background: #ffffff;
            }
            p {
              margin: 0 0 14px;
              color: #374151;
              font-size: 15px;
            }
            .note {
              margin: 18px 0;
              padding: 12px 14px;
              background: #f0fdf4;
              border-left: 4px solid #22c55e;
              border-radius: 8px;
              color: #166534;
              font-size: 14px;
            }
            .footer {
              margin-top: 28px;
              padding: 20px 32px;
              background: #f9fafb;
              border-top: 1px solid #eef1f6;
              color: #6b7280;
              font-size: 13px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>✅ Message Received</h1>
            </div>
            <div class="body">
              <p>Hi ${name},</p>
              <p>Thank you for contacting ${APP_NAME} support! We've received your message regarding:</p>
              <p style="font-weight: 700; color: #111827; margin-left: 12px;">"${subject}"</p>
              
              <div class="note">
                <strong>✓ What happens next?</strong><br/>
                Our support team will review your message and get back to you within 24-48 hours. For urgent matters, we'll respond as quickly as possible.
              </div>
              
              <p>If you need to add any additional information, feel free to reply to this email.</p>
              
              <p style="margin-top: 24px;">Best regards,<br/><strong>${APP_NAME} Support Team</strong></p>
            </div>
            <div class="footer">
              This is an automated confirmation. Please do not reply to this email unless you have additional information to share.
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending contact confirmation email:', error);
      throw error;
    }

    console.log('Contact confirmation email sent:', data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Error sending contact confirmation email:', error);
    throw error;
  }
};

export {
  sendVerificationEmail,
  sendInviteEmail,
  sendPasswordResetEmail,
  sendPasswordChangeConfirmation,
  sendContactNotificationEmail,
  sendContactConfirmationEmail,
};





// import { resend } from "../config/emailClient.js";
// import { verificationTemplate } from "../templates/verificationTemplate.js";

// const APP_NAME = process.env.APP_NAME || "Inblox";
// const FROM_EMAIL = process.env.EMAIL_FROM;

// const sendEmail = async ({ to, subject, html, replyTo }) => {
//   return resend.emails.send({
//     from: `${APP_NAME} <${FROM_EMAIL}>`,
//     to: [to],
//     subject,
//     html,
//     replyTo,
//   });
// };

// export const sendVerificationEmail = async (email, token, firstName) => {
//   const url = `${process.env.BACKEND_URL}/api/auth/verify-email/${token}`;

//   const html = verificationTemplate({
//     firstName,
//     url,
//     appName: APP_NAME,
//   });

//   return sendEmail({
//     to: email,
//     subject: "Verify Your Email Address",
//     html,
//   });
// };
