import nodemailer from 'nodemailer';
import { getAppSettingsConfig } from './configService.js';

export interface EmailOptions {
  to: string;
  name?: string;
  appUrl?: string;
}

// In-memory cooldown tracking to prevent emailing the same user repeatedly within 30 minutes
const lastSentTimestamps = new Map<string, number>();
const EMAIL_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

export function isEmailConfigured(): boolean {
  return Boolean(
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ||
    Boolean(process.env.RESEND_API_KEY)
  );
}

export function getEmailConfigDetails() {
  const host = process.env.SMTP_HOST || 'Not set';
  const user = process.env.SMTP_USER || 'Not set';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'AbyssGPT <noreply@abyssgpt.com>';
  const configured = isEmailConfigured();
  return {
    configured,
    host,
    user: user !== 'Not set' ? user.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'Not set',
    from,
  };
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Sends an automated "I am active" notification email to a logged-in user in English.
 */
export async function sendActiveNotificationEmail({ to, name, appUrl }: EmailOptions): Promise<{
  success: boolean;
  message: string;
  delivered: boolean;
}> {
  if (!to || !to.includes('@')) {
    return { success: false, message: 'Invalid recipient email address.', delivered: false };
  }

  const normalizedEmail = to.trim().toLowerCase();
  const now = Date.now();
  const lastSent = lastSentTimestamps.get(normalizedEmail);

  // Check cooldown to avoid inbox flooding on multiple reloads
  if (lastSent && now - lastSent < EMAIL_COOLDOWN_MS) {
    const minutesLeft = Math.ceil((EMAIL_COOLDOWN_MS - (now - lastSent)) / 60000);
    return {
      success: true,
      delivered: false,
      message: `Active email recently sent. Cooldown active for ${minutesLeft} more minute(s).`,
    };
  }

  const settings = await getAppSettingsConfig();
  const displayName = name?.trim() || normalizedEmail.split('@')[0] || 'there';
  const resolvedUrl = appUrl || process.env.FRONTEND_URL || 'https://abyssgpt.ai';

  const subject = `AbyssGPT is Active & Ready to Assist You 🚀`;
  const textContent = `Hi ${displayName},\n\nI am active, online, and ready to assist you on AbyssGPT!\n\nWhether you need help with coding, research, writing, debugging, or brainstorming, I'm here for you.\n\nOpen AbyssGPT now: ${resolvedUrl}\n\nBest regards,\nAbyssGPT AI Assistant`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #111827; border: 1px solid #1f293d; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; border-bottom: 1px solid #1f293d; background: linear-gradient(180deg, rgba(99, 102, 241, 0.12) 0%, transparent 100%);">
              <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 50%; background: #6366f1; color: #ffffff; font-weight: bold; font-size: 22px; text-align: center;">
                ✦
              </div>
              <h1 style="margin: 16px 0 4px; font-size: 22px; font-weight: 700; color: #f8fafc; letter-spacing: -0.02em;">
                AbyssGPT is Active
              </h1>
              <p style="margin: 0; font-size: 13px; color: #94a3b8;">
                Your AI Assistant is standing by
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                Hi <strong style="color: #f8fafc;">${displayName}</strong>,
              </p>
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                I noticed you logged in to your account. I am <strong style="color: #38bdf8;">active, online, and ready to assist you</strong> right now!
              </p>

              <div style="background-color: #161f33; border: 1px solid #233152; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 10px; font-size: 13px; font-weight: 600; color: #a5b4fc; text-transform: uppercase; letter-spacing: 0.05em;">
                  Here is what you can ask me to do:
                </p>
                <ul style="margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.7; color: #cbd5e1;">
                  <li>Write, review, or debug code in any language</li>
                  <li>Perform live web research on any topic</li>
                  <li>Summarize complex articles or analyze technical documents</li>
                  <li>Brainstorm creative ideas, plans, and architectures</li>
                </ul>
              </div>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 12px;">
                <tr>
                  <td align="center">
                    <a href="${resolvedUrl}" style="display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 10px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
                      Start Chatting with AbyssGPT →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px 24px; text-align: center; border-top: 1px solid #1f293d; background-color: #0d1322;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #64748b;">
                You received this notification because you logged in to AbyssGPT.
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                &copy; ${new Date().getFullYear()} AbyssGPT. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const transporter = createTransporter();

  if (!transporter) {
    // Record cooldown so we don't spam logs
    lastSentTimestamps.set(normalizedEmail, now);
    console.log(
      `[EmailService] SMTP not configured. Logged active notification email for: ${normalizedEmail} (Subject: "${subject}")`
    );
    return {
      success: true,
      delivered: false,
      message: 'SMTP credentials not configured on backend. Email logged for debugging.',
    };
  }

  try {
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'AbyssGPT <noreply@abyssgpt.com>';
    await transporter.sendMail({
      from: fromAddress,
      to: normalizedEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });

    lastSentTimestamps.set(normalizedEmail, now);
    console.log(`[EmailService] Active notification email successfully delivered to ${normalizedEmail}`);
    return {
      success: true,
      delivered: true,
      message: `Active notification email dispatched to ${normalizedEmail}`,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[EmailService] Failed to send email to ${normalizedEmail}:`, errMsg);
    return {
      success: false,
      delivered: false,
      message: `Failed to deliver email: ${errMsg}`,
    };
  }
}

/**
 * Sends a test email to verify SMTP configuration
 */
export async function sendTestEmail(targetEmail: string): Promise<{ success: boolean; message: string }> {
  const transporter = createTransporter();
  if (!transporter) {
    return {
      success: false,
      message: 'SMTP settings are not configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in environment.',
    };
  }

  try {
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'AbyssGPT <noreply@abyssgpt.com>';
    await transporter.sendMail({
      from: fromAddress,
      to: targetEmail,
      subject: 'AbyssGPT - SMTP Connection Test ✅',
      text: 'Congratulations! Your SMTP email setup for AbyssGPT is working correctly.',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; padding: 24px; background: #111827; color: #f1f5f9; border-radius: 12px;">
          <h2 style="color: #38bdf8;">AbyssGPT Email Test Successful</h2>
          <p>Your SMTP mail configuration is online and ready to send automated active notifications to users.</p>
          <p style="color: #94a3b8; font-size: 12px;">Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
    });
    return { success: true, message: `Test email sent successfully to ${targetEmail}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `SMTP error: ${msg}` };
  }
}
