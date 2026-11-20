import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { EnvService } from './env.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** MailProvider: SMTP when SMTP_URL is set, otherwise the message is only logged. */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transport: Transporter | null;
  constructor(private readonly envs: EnvService) {
    this.transport = envs.env.SMTP_URL ? nodemailer.createTransport(envs.env.SMTP_URL) : null;
  }

  get enabled(): boolean {
    return !!this.transport;
  }

  async send(msg: MailMessage): Promise<void> {
    if (!this.transport) {
      this.logger.log(`(sem SMTP) para=${msg.to} assunto="${msg.subject}"\n${msg.text}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: this.envs.env.MAIL_FROM, ...msg });
    } catch (e) {
      this.logger.error(`falha ao enviar e-mail para ${msg.to}: ${(e as Error).message}`);
    }
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
