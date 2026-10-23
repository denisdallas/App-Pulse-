import nodemailer from 'nodemailer';
import { CampaignRecipient, SuppressionRecord } from '../../src/types.ts';
import { filterSuppressedRecipients } from '../../src/lib/suppression.ts';

export interface EmailDeliveryConfig {
  provider: 'smtp' | 'resend' | 'unconfigured';
  host?: string;
  port?: number;
  user?: string;
  fromEmail: string;
  isReady: boolean;
}

export function getEmailProviderConfig(): EmailDeliveryConfig {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    return {
      provider: 'resend',
      fromEmail: process.env.OUTREACH_FROM_EMAIL || 'intelligence@apppulse.io',
      isReady: true,
    };
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    return {
      provider: 'smtp',
      host: smtpHost,
      port: Number(process.env.SMTP_PORT) || 587,
      user: smtpUser,
      fromEmail: process.env.OUTREACH_FROM_EMAIL || smtpUser,
      isReady: true,
    };
  }

  return {
    provider: 'unconfigured',
    fromEmail: 'unconfigured@apppulse.io',
    isReady: false,
  };
}

export async function sendOutreachEmail(params: {
  recipient: CampaignRecipient;
  subject: string;
  body: string;
}): Promise<{ success: boolean; providerMessageId?: string; error?: string }> {
  const config = getEmailProviderConfig();

  if (!config.isReady) {
    return {
      success: false,
      error: 'Outreach email dispatch blocked: No live email provider configured. Please provide SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) or RESEND_API_KEY in Integration Settings. Simulated delivery is strictly forbidden.',
    };
  }

  // 1. Resend API
  if (config.provider === 'resend') {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.fromEmail,
          to: [params.recipient.email],
          subject: params.subject,
          text: params.body,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Resend HTTP ${res.status}`);
      }

      return {
        success: true,
        providerMessageId: data.id,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Resend dispatch failed: ${err.message}`,
      };
    }
  }

  // 2. SMTP Transporter
  if (config.provider === 'smtp') {
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: {
          user: config.user,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: config.fromEmail,
        to: params.recipient.email,
        subject: params.subject,
        text: params.body,
      });

      return {
        success: true,
        providerMessageId: info.messageId,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `SMTP dispatch failed: ${err.message}`,
      };
    }
  }

  return { success: false, error: 'Unknown provider' };
}
