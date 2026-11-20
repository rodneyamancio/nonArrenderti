import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { IntegrationsService } from '../modules/integrations/integrations.service';
import { EnvService } from './env.service';
import { fetchJson } from './http';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type MailChannel = 'resend' | 'smtp' | 'log';

/**
 * MailProvider. Order: Resend (configured by the platform admin, credentials encrypted in
 * the database) → SMTP (SMTP_URL) → log only. Failures are logged, never thrown at the caller.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly smtp: Transporter | null;
  constructor(
    private readonly envs: EnvService,
    private readonly integrations: IntegrationsService,
  ) {
    this.smtp = envs.env.SMTP_URL ? nodemailer.createTransport(envs.env.SMTP_URL) : null;
  }

  async channel(): Promise<MailChannel> {
    const r = await this.integrations.load('resend');
    if (r.enabled && r.secrets.apiKey && r.config.fromEmail) return 'resend';
    return this.smtp ? 'smtp' : 'log';
  }

  async enabled(): Promise<boolean> {
    return (await this.channel()) !== 'log';
  }

  /** Sends and returns the provider id. Throws only when `strict` (used by the admin "send test"). */
  async send(msg: MailMessage, strict = false): Promise<string | null> {
    try {
      const channel = await this.channel();
      if (channel === 'resend') return await this.sendResend(msg);
      if (channel === 'smtp') {
        const info = await this.smtp!.sendMail({ from: this.envs.env.MAIL_FROM, ...msg });
        return String(info.messageId ?? 'smtp');
      }
      this.logger.log(`(sem provedor de e-mail) para=${msg.to} assunto="${msg.subject}"`);
      if (strict) throw new Error('Nenhum provedor de e-mail configurado');
      return null;
    } catch (e) {
      this.logger.error(`falha ao enviar e-mail para ${msg.to}: ${(e as Error).message}`);
      if (strict) throw e;
      return null;
    }
  }

  /** Resend API (https://resend.com/docs/api-reference/emails/send-email). */
  private async sendResend(msg: MailMessage): Promise<string> {
    const r = await this.integrations.load('resend');
    const name = r.config.fromName.replace(/[<>"]/g, '');
    const { data } = await fetchJson<{ id: string }>('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${r.secrets.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: name ? `${name} <${r.config.fromEmail}>` : r.config.fromEmail,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        ...(r.config.replyTo ? { reply_to: r.config.replyTo } : {}),
      }),
      timeoutMs: 15_000,
    });
    return data.id;
  }

  /** Simple branded layout. */
  html(title: string, body: string, cta?: { label: string; url: string }): string {
    const button = cta
      ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#6D3BFF;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600">${cta.label}</a></p>`
      : '';
    return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#17142B">
<p style="font-size:20px;font-weight:800;color:#6D3BFF;margin:0 0 24px">tenace</p>
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1><div style="font-size:15px;line-height:1.55">${body}</div>${button}
<p style="font-size:12px;color:#7A7690;margin-top:32px">non arrenderti 💜</p></div>`;
  }
}
