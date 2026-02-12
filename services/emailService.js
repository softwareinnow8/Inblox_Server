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

export {
  sendVerificationEmail,
  sendInviteEmail,
  sendPasswordResetEmail,
  sendPasswordChangeConfirmation,
};
