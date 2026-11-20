import { z } from 'zod';

/** Environment contract. Validated at boot; production refuses placeholders. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3311),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    /** Public URL of the web app. No trailing slash. */
    APP_WEB_URL: z.string().url(),
    UPLOAD_DIR: z.string().default('./uploads'),
    /** 32 bytes, base64. Encrypts provider credentials stored in the database (rotation = re-enter them). */
    ENCRYPTION_KEY: z.string().min(1),
    SMTP_URL: z.string().default(''),
    MAIL_FROM: z.string().default('Tenace <nao-responda@tenace.local>'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 90).default(24 * 30),
    SESSION_IDLE_HOURS: z.coerce.number().int().positive().max(24 * 90).default(24 * 14),
    SCHEDULER: z.enum(['on', 'off']).default('on'),
    LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug']).default('log'),
    SEED_ADMIN_EMAIL: z.string().default(''),
    SEED_ADMIN_PASSWORD: z.string().default(''),
    SEED_DEMO_DATA: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    BUILD_SHA: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    if (Buffer.from(env.ENCRYPTION_KEY, 'base64').length !== 32) ctx.addIssue({ code: 'custom', path: ['ENCRYPTION_KEY'], message: 'ENCRYPTION_KEY deve ter 32 bytes em base64 (rode pnpm setup)' });
    if (env.NODE_ENV !== 'production') return;
    const PLACEHOLDER = /change-me|changeme|example|placeholder|__generated__|123456/i;
    if (!env.APP_WEB_URL.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['APP_WEB_URL'], message: 'use https em produção' });
    if (env.SEED_DEMO_DATA) ctx.addIssue({ code: 'custom', path: ['SEED_DEMO_DATA'], message: 'dados de demonstração não podem ir para produção' });
    if (env.SEED_ADMIN_PASSWORD && (PLACEHOLDER.test(env.SEED_ADMIN_PASSWORD) || env.SEED_ADMIN_PASSWORD.length < 12))
      ctx.addIssue({ code: 'custom', path: ['SEED_ADMIN_PASSWORD'], message: 'senha fraca em produção' });
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;
export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  if (!cached) cached = envSchema.parse(raw);
  return cached;
}
