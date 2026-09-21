import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendWelcomeInviteEmailParams {
  to: string;
  name: string;
  inviteCode: string;
  hackathonTitle: string;
}

interface SendPasswordResetEmailParams {
  to: string;
  name: string;
  resetUrl: string;
  token: string;
}

interface SendGenericWelcomeEmailParams {
  to: string;
  name: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendGenericWelcomeEmail(params: SendGenericWelcomeEmailParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not set. Skipping generic welcome email.');
      return;
    }

    const from = this.config.get<string>('WELCOME_EMAIL_FROM', 'Tupliq <onboarding@resend.dev>');
    const appName = this.config.get<string>('APP_NAME', 'Tupliq');
    const appUrl = this.config.get<string>('APP_URL', 'https://www.tupliq.com');
    const subject = `Welcome to ${appName}`;

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
        html: this.buildGenericWelcomeHtml(params, appName, appUrl),
        text: this.buildGenericWelcomeText(params, appName, appUrl),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend email failed with ${response.status}: ${body}`);
    }
  }

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

  async sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not set. Skipping password reset email.');
      return;
    }

    const from = this.config.get<string>('WELCOME_EMAIL_FROM', 'Tupliq <onboarding@resend.dev>');
    const appName = this.config.get<string>('APP_NAME', 'Tupliq');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: `Reset your ${appName} password`,
        html: this.buildPasswordResetHtml(params, appName),
        text: [
          `Hi ${params.name},`,
          '',
          `We received a request to reset your ${appName} password.`,
          '',
          'Open this link to choose a new password:',
          params.resetUrl,
          '',
          `Or paste this code into the app:`,
          params.token,
          '',
          'This link expires in one hour. If you did not request a reset, you can ignore this email.',
        ].join('\n'),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend email failed with ${response.status}: ${body}`);
    }
  }

  private buildPasswordResetHtml(params: SendPasswordResetEmailParams, appName: string): string {
    return `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h1 style="font-size: 22px; margin-bottom: 12px;">Reset your ${this.escapeHtml(appName)} password</h1>
        <p>Hi ${this.escapeHtml(params.name)},</p>
        <p>We received a request to reset your password.</p>
        <p style="margin: 24px 0;">
          <a href="${params.resetUrl}" style="background:#4F46E5;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Choose a new password</a>
        </p>
        <p>If the button does not work, paste this code into the app:</p>
        <p style="font-family: monospace; font-size: 14px; word-break: break-all; background:#F3F4F6; padding:10px; border-radius:6px;">
          ${this.escapeHtml(params.token)}
        </p>
        <p>This link expires in one hour. If you did not request a reset, you can ignore this email.</p>
      </div>
    `;
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

  private buildGenericWelcomeText(params: SendGenericWelcomeEmailParams, appName: string, appUrl: string): string {
    return [
      `Hi ${params.name},`,
      '',
      `Welcome to ${appName}! We're excited to have you on board.`,
      '',
      `Get started by visiting: ${appUrl}`,
      '',
      'If you have any questions, just reply to this email.',
    ].join('\n');
  }

  private buildGenericWelcomeHtml(params: SendGenericWelcomeEmailParams, appName: string, appUrl: string): string {
    return `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h1 style="font-size: 24px; margin-bottom: 12px;">Welcome to ${this.escapeHtml(appName)}</h1>
        <p>Hi ${this.escapeHtml(params.name)},</p>
        <p>We're excited to have you on board.</p>
        <p style="margin: 24px 0;">
          <a href="${appUrl}" style="background:#4F46E5;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Get Started</a>
        </p>
        <p>If you have any questions, just reply to this email.</p>
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
