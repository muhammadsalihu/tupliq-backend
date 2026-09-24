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

interface SendVerificationEmailParams {
  to: string;
  name: string;
  verifyUrl: string;
  token: string;
}

/**
 * Tupliq brand tokens — "Circuit Green". Source of truth is the app, not this file:
 * tupliq-agent-mobile/constants/theme.ts and tupliq-web/src/index.css. Keep in sync;
 * the previous templates used an off-brand indigo (#4F46E5).
 */
const BRAND = {
  green: '#1F6E4A',
  mint: '#5CB37E',
  mintTint: '#EAF4EE',
  ink: '#232823',
  body: '#4A524A',
  muted: '#6B6F69',
  pageBg: '#F5F6F1',
  card: '#FDFDFB',
  hairline: '#DEE0D9',
  codeBg: '#F0F2ED',
};

const FONT_DISPLAY =
  "'Quicksand','Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const FONT_BODY =
  "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const FONT_MONO =
  "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

interface LayoutOptions {
  appName: string;
  appUrl: string;
  /** Inbox preview line, shown next to the subject before the body loads. */
  preheader: string;
  heading: string;
  /** Opening paragraph. Caller must pass escaped/trusted markup. */
  intro: string;
  /** Extra body markup. Caller must pass escaped/trusted markup. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  code?: { label: string; value: string; note?: string };
  /** Closing paragraph. Caller must pass escaped/trusted markup. */
  outro?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerificationEmail(params: SendVerificationEmailParams): Promise<void> {
    const appName = this.appName();
    const appUrl = this.appUrl();
    const preheader = `One tap to confirm your email and finish setting up your ${appName} account. Expires in 24 hours.`;

    await this.send({
      to: params.to,
      subject: `Verify your email for ${appName}`,
      html: this.layout({
        appName,
        appUrl,
        preheader,
        heading: 'Verify your email',
        intro: `Hi ${this.escapeHtml(params.name)}, welcome to ${this.escapeHtml(
          appName,
        )}. Confirm this address and your account is ready to go.`,
        bodyHtml: `<p style="margin:0 0 8px;font-family:${FONT_BODY};font-size:15px;line-height:24px;color:${BRAND.body};">Verifying unlocks your full monthly run allowance and lets us reach you about your account.</p>`,
        cta: { label: 'Verify my email', url: params.verifyUrl },
        code: {
          label: 'Or enter this code in the app',
          value: params.token,
          note: 'This link and code expire in 24 hours.',
        },
        outro: `Didn't create a ${this.escapeHtml(
          appName,
        )} account? You can ignore this email — nothing happens until you verify.`,
      }),
      text: this.verificationText(params, appName),
    });
  }

  async sendGenericWelcomeEmail(params: SendGenericWelcomeEmailParams): Promise<void> {
    const appName = this.appName();
    const appUrl = this.appUrl();
    const preheader = `You're in. Here's how to get your first result in the next five minutes.`;

    await this.send({
      to: params.to,
      subject: `Welcome to ${appName}`,
      html: this.layout({
        appName,
        appUrl,
        preheader,
        heading: `Welcome aboard, ${this.escapeHtml(params.name)}`,
        intro: `Your ${this.escapeHtml(
          appName,
        )} account is live. ${this.escapeHtml(
          appName,
        )} runs AI agents on your real work — research, drafting, planning, code — and hands you the finished output, not a chat log.`,
        bodyHtml: this.stepsHtml([
          ['Pick an agent', 'Choose the assistant that fits the task at hand.'],
          ['Describe the job', 'Plain English. No prompt engineering required.'],
          ['Take the result', 'Copy it, share it, or save it for later.'],
        ]),
        cta: { label: 'Open Tupliq', url: appUrl },
        outro: `Questions? Just reply to this email — a real person reads it.`,
      }),
      text: this.genericWelcomeText(params, appName, appUrl),
    });
  }

  async sendWelcomeInviteEmail(params: SendWelcomeInviteEmailParams): Promise<void> {
    const appName = this.appName();
    const appUrl = this.appUrl();
    const preheader = `Here's your code to join ${params.hackathonTitle} on ${appName}.`;

    await this.send({
      to: params.to,
      subject: `Your invite code for ${params.hackathonTitle}`,
      html: this.layout({
        appName,
        appUrl,
        preheader,
        heading: 'Your invite code',
        intro: `Hi ${this.escapeHtml(
          params.name,
        )}, you're in. Use the code below to join <strong style="color:${BRAND.ink};">${this.escapeHtml(
          params.hackathonTitle,
        )}</strong> on ${this.escapeHtml(appName)}.`,
        bodyHtml: '',
        code: {
          label: 'Your invite code',
          value: params.inviteCode,
          note: 'Enter it in the app to join the hackathon.',
        },
        cta: { label: 'Join in the app', url: appUrl },
      }),
      text: this.welcomeInviteText(params, appName),
    });
  }

  async sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<void> {
    const appName = this.appName();
    const appUrl = this.appUrl();
    const preheader = `Choose a new password. This link expires in 1 hour.`;

    await this.send({
      to: params.to,
      subject: `Reset your ${appName} password`,
      html: this.layout({
        appName,
        appUrl,
        preheader,
        heading: 'Reset your password',
        intro: `Hi ${this.escapeHtml(
          params.name,
        )}, we received a request to reset your ${this.escapeHtml(
          appName,
        )} password. Choose a new one below.`,
        bodyHtml: '',
        cta: { label: 'Choose a new password', url: params.resetUrl },
        code: {
          label: 'Or enter this code in the app',
          value: params.token,
          note: 'This link and code expire in 1 hour.',
        },
        outro: `If you didn't request this, you can safely ignore this email — your password will not change.`,
      }),
      text: this.passwordResetText(params, appName),
    });
  }

  /**
   * Internal heads-up when someone joins the Agent waitlist, so a demo can be
   * booked while the interest is warm. Goes to WAITLIST_NOTIFY_EMAIL (the owner),
   * and quotes the visitor's address so replying is one click.
   */
  async sendWaitlistNotification(params: {
    email: string;
    name?: string | null;
    goal?: string | null;
    source?: string | null;
  }): Promise<void> {
    const to = this.config.get<string>(
      'WAITLIST_NOTIFY_EMAIL',
      'muhammad@airbills.ng',
    );
    const esc = (value?: string | null) =>
      this.escapeHtml(value?.trim() ? value.trim() : '—');

    const rows: Array<[string, string]> = [
      ['Email', params.email],
      ['Name', params.name ?? '—'],
      ['Wants the agent to', params.goal ?? '—'],
      ['Source', params.source ?? 'agent-page'],
    ];
    const rowHtml = rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:${BRAND.muted};white-space:nowrap">${label}</td>` +
          `<td style="padding:6px 0;color:${BRAND.ink}"><strong>${esc(value)}</strong></td></tr>`,
      )
      .join('');

    await this.send({
      to,
      subject: `New agent waitlist signup: ${params.email}`,
      html: this.layout({
        appName: this.appName(),
        appUrl: this.appUrl(),
        preheader: `${params.email} asked for early access to the ${this.appName()} app.`,
        heading: 'New waitlist signup',
        intro: `Someone asked for early access to the ${this.escapeHtml(
          this.appName(),
        )} Android app. Reply to this message to reach them and book a demo.`,
        bodyHtml: `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${rowHtml}</table>`,
        cta: { label: 'Open the agent page', url: `${this.appUrl()}/agent` },
        outro: 'Sent by the waitlist endpoint on tupliq.com/agent.',
      }),
      text: [
        'New waitlist signup',
        `Email: ${params.email}`,
        `Name: ${params.name ?? '—'}`,
        `Wants the agent to: ${params.goal ?? '—'}`,
        `Source: ${params.source ?? 'agent-page'}`,
      ].join('\n'),
    });
  }

  // ── sending ────────────────────────────────────────────────────────────────

  private appName(): string {
    return this.config.get<string>('APP_NAME', 'Tupliq');
  }

  private appUrl(): string {
    return this.config.get<string>('APP_URL', 'https://www.tupliq.com');
  }

  private async send(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY is not set. Skipping "${opts.subject}" to ${opts.to}.`,
      );
      return;
    }

    const from = this.config.get<string>('WELCOME_EMAIL_FROM', 'Tupliq <onboarding@resend.dev>');
    const replyTo = this.config.get<string>('REPLY_TO_EMAIL');

    const payload: Record<string, unknown> = {
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    };
    if (replyTo) {
      payload.reply_to = replyTo;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend email failed with ${response.status}: ${body}`);
    }
  }

  // ── layout ─────────────────────────────────────────────────────────────────

  private layout(opts: LayoutOptions): string {
    const { appName, appUrl, preheader, heading, intro, bodyHtml, cta, code, outro } = opts;
    const year = new Date().getFullYear();
    const domain = appUrl.replace(/^https?:\/\//, '');

    const ctaHtml = cta
      ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 6px;">
                <tr>
                  <td align="center" bgcolor="${BRAND.green}" style="border-radius:12px;">
                    <a href="${this.escapeAttr(cta.url)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${FONT_BODY};font-size:16px;font-weight:700;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:12px;">${this.escapeHtml(
                      cta.label,
                    )}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 4px;font-family:${FONT_BODY};font-size:13px;line-height:20px;color:${BRAND.muted};">Button not working? Paste this into your browser:</p>
              <p style="margin:0;font-family:${FONT_MONO};font-size:12px;line-height:18px;word-break:break-all;"><a href="${this.escapeAttr(
                cta.url,
              )}" target="_blank" class="brand-text" style="color:${BRAND.green};text-decoration:underline;">${this.escapeHtml(
                cta.url,
              )}</a></p>`
      : '';

    const codeHtml = code
      ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
                <tr>
                  <td class="hairline" style="border-top:1px solid ${BRAND.hairline};padding-top:22px;">
                    <p style="margin:0 0 10px;font-family:${FONT_BODY};font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};">${this.escapeHtml(
                      code.label,
                    )}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="code-bg" bgcolor="${BRAND.codeBg}" style="background-color:${BRAND.codeBg};border:1px solid ${BRAND.hairline};border-radius:12px;padding:16px 18px;">
                          <p class="code-text" style="margin:0;font-family:${FONT_MONO};font-size:14px;line-height:22px;color:${BRAND.ink};word-break:break-all;letter-spacing:0.02em;">${this.escapeHtml(
                            code.value,
                          )}</p>
                        </td>
                      </tr>
                    </table>
                    ${
                      code.note
                        ? `<p style="margin:10px 0 0;font-family:${FONT_BODY};font-size:13px;line-height:20px;color:${BRAND.muted};">${this.escapeHtml(
                            code.note,
                          )}</p>`
                        : ''
                    }
                  </td>
                </tr>
              </table>`
      : '';

    const outroHtml = outro
      ? `<p class="hairline" style="margin:26px 0 0;padding-top:22px;border-top:1px solid ${BRAND.hairline};font-family:${FONT_BODY};font-size:14px;line-height:22px;color:${BRAND.muted};">${outro}</p>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${this.escapeHtml(heading)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=Quicksand:wght@600;700&display=swap');
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
    body{margin:0;padding:0;width:100%!important;}
    @media only screen and (max-width:620px){
      .wrap{padding:24px 14px!important;}
      .card{padding:32px 24px!important;}
      .h1{font-size:24px!important;line-height:32px!important;}
    }
    @media (prefers-color-scheme: dark){
      .page-bg{background-color:#141814!important;}
      .card-bg{background-color:#1C211C!important;border-color:#2C332C!important;}
      .ink{color:#F2F4EF!important;}
      .body-text{color:#C3CAC2!important;}
      .muted-text{color:#9AA39B!important;}
      .hairline{border-color:#2C332C!important;}
      .code-bg{background-color:#232A23!important;border-color:#333B33!important;}
      .code-text{color:#EDF1EB!important;}
      .brand-text{color:#5CB37E!important;}
    }
  </style>
</head>
<body class="page-bg" style="margin:0;padding:0;background-color:${BRAND.pageBg};">
  <div style="display:none;font-size:1px;color:${BRAND.pageBg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${this.escapeHtml(
    preheader,
  )}&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page-bg" style="background-color:${BRAND.pageBg};">
    <tr>
      <td align="center" class="wrap" style="padding:40px 16px;">

        <!-- Text wordmark: still renders when images are blocked. -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">
          <tr>
            <td style="padding:0 0 18px;">
              <span class="brand-text" style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.green};">${this.escapeHtml(
                appName,
              )}</span>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;border-radius:16px;">
          <tr>
            <td class="card-bg" bgcolor="${BRAND.card}" style="background-color:${BRAND.card};border:1px solid ${BRAND.hairline};border-radius:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td height="5" bgcolor="${BRAND.green}" style="background-color:${BRAND.green};height:5px;line-height:5px;font-size:0;">&nbsp;</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="card" style="padding:40px 40px 36px;">
                    <h1 class="h1 ink" style="margin:0 0 16px;font-family:${FONT_DISPLAY};font-size:28px;line-height:36px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.ink};">${this.escapeHtml(
                      heading,
                    )}</h1>
                    <p class="body-text" style="margin:0 0 16px;font-family:${FONT_BODY};font-size:16px;line-height:26px;color:${BRAND.body};">${intro}</p>
                    ${bodyHtml}
                    ${ctaHtml}
                    ${codeHtml}
                    ${outroHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">
          <tr>
            <td style="padding:24px 4px 0;">
              <p class="muted-text" style="margin:0 0 8px;font-family:${FONT_BODY};font-size:13px;line-height:20px;color:${BRAND.muted};">
                Sent by ${this.escapeHtml(appName)} — AI agents that finish the work. This is a service message about your account.
              </p>
              <p class="muted-text" style="margin:0;font-family:${FONT_BODY};font-size:13px;line-height:20px;color:${BRAND.muted};">
                <a href="${this.escapeAttr(appUrl)}" target="_blank" class="brand-text" style="color:${BRAND.green};text-decoration:underline;">${this.escapeHtml(
                  domain,
                )}</a>
                &nbsp;·&nbsp;
                <a href="${this.escapeAttr(appUrl)}/privacy" target="_blank" class="brand-text" style="color:${BRAND.green};text-decoration:underline;">Privacy</a>
                &nbsp;·&nbsp;
                <a href="${this.escapeAttr(appUrl)}/terms" target="_blank" class="brand-text" style="color:${BRAND.green};text-decoration:underline;">Terms</a>
              </p>
              <p class="muted-text" style="margin:12px 0 0;font-family:${FONT_BODY};font-size:12px;line-height:18px;color:${BRAND.muted};">© ${year} ${this.escapeHtml(
                appName,
              )}. All rights reserved.</p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /** Numbered quick-start steps used by the welcome email. */
  private stepsHtml(steps: [string, string][]): string {
    const rows = steps
      .map(
        ([title, body], i) => `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
                <tr>
                  <td width="30" valign="top" style="padding:2px 0 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="24" height="24" align="center" bgcolor="${BRAND.mintTint}" style="width:24px;height:24px;background-color:${BRAND.mintTint};border-radius:12px;font-family:${FONT_BODY};font-size:12px;font-weight:700;color:${BRAND.green};">${i + 1}</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top" style="padding:0 0 0 12px;">
                    <p class="ink" style="margin:0;font-family:${FONT_BODY};font-size:15px;font-weight:700;line-height:22px;color:${BRAND.ink};">${this.escapeHtml(
                      title,
                    )}</p>
                    <p class="body-text" style="margin:2px 0 0;font-family:${FONT_BODY};font-size:14px;line-height:22px;color:${BRAND.body};">${this.escapeHtml(
                      body,
                    )}</p>
                  </td>
                </tr>
              </table>`,
      )
      .join('');
    return `<div style="margin:24px 0 0;">${rows}</div>`;
  }

  // ── plain-text alternatives ────────────────────────────────────────────────

  private verificationText(params: SendVerificationEmailParams, appName: string): string {
    return [
      `Hi ${params.name},`,
      '',
      `Welcome to ${appName}. Confirm your email address and your account is ready to go.`,
      '',
      'Verify your email:',
      params.verifyUrl,
      '',
      'Or enter this code in the app:',
      params.token,
      '',
      'This link and code expire in 24 hours.',
      '',
      `Didn't create a ${appName} account? You can ignore this email.`,
      '',
      `— ${appName}`,
    ].join('\n');
  }

  private genericWelcomeText(
    params: SendGenericWelcomeEmailParams,
    appName: string,
    appUrl: string,
  ): string {
    return [
      `Hi ${params.name},`,
      '',
      `Your ${appName} account is live. ${appName} runs AI agents on your real work — research, drafting, planning, code — and hands you the finished output, not a chat log.`,
      '',
      'Getting started:',
      '  1. Pick an agent that fits the task.',
      '  2. Describe the job in plain English.',
      '  3. Take the result — copy it, share it, or save it.',
      '',
      `Open ${appName}: ${appUrl}`,
      '',
      'Questions? Just reply to this email — a real person reads it.',
      '',
      `— ${appName}`,
    ].join('\n');
  }

  private welcomeInviteText(params: SendWelcomeInviteEmailParams, appName: string): string {
    return [
      `Hi ${params.name},`,
      '',
      `You're in. Use the code below to join ${params.hackathonTitle} on ${appName}.`,
      '',
      'Your invite code:',
      params.inviteCode,
      '',
      'Enter it in the app to join the hackathon.',
      '',
      `— ${appName}`,
    ].join('\n');
  }

  private passwordResetText(params: SendPasswordResetEmailParams, appName: string): string {
    return [
      `Hi ${params.name},`,
      '',
      `We received a request to reset your ${appName} password. Choose a new one here:`,
      params.resetUrl,
      '',
      'Or enter this code in the app:',
      params.token,
      '',
      'This link and code expire in 1 hour.',
      '',
      "If you didn't request this, you can safely ignore this email — your password will not change.",
      '',
      `— ${appName}`,
    ].join('\n');
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private escapeHtml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /** Attribute-context escaping so a URL cannot break out of an href. */
  private escapeAttr(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
