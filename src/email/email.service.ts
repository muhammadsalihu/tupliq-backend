import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendWelcomeInviteEmailParams {
  to: string;
  name: string;
  inviteCode: string;
  hackathonTitle: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendWelcomeInviteEmail(params: SendWelcomeInviteEmailParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not set. Skipping welcome invite email.');
      return;
    }

    const from = this.config.get<string>('WELCOME_EMAIL_FROM', 'Tupliq <onboarding@resend.dev>');
    const appName = this.config.get<string>('APP_NAME', 'Tupliq');
    const subject = `Welcome to ${appName} - your hackathon invite code`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject,
        html: this.buildWelcomeInviteHtml(params, appName),
        text: this.buildWelcomeInviteText(params, appName),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend email failed with ${response.status}: ${body}`);
    }
  }

  private buildWelcomeInviteText(params: SendWelcomeInviteEmailParams, appName: string): string {
    return [
      `Hi ${params.name},`,
      '',
      `Welcome to ${appName}. Your invite code for ${params.hackathonTitle} is:`,
      '',
      params.inviteCode,
      '',
      'Use this code in the app to join the hackathon.',
    ].join('\n');
  }

  private buildWelcomeInviteHtml(params: SendWelcomeInviteEmailParams, appName: string): string {
    return `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h1 style="font-size: 24px; margin-bottom: 12px;">Welcome to ${this.escapeHtml(appName)}</h1>
        <p>Hi ${this.escapeHtml(params.name)},</p>
        <p>Your invite code for <strong>${this.escapeHtml(params.hackathonTitle)}</strong> is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 2px; margin: 24px 0;">
          ${this.escapeHtml(params.inviteCode)}
        </p>
        <p>Use this code in the app to join the hackathon.</p>
      </div>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
