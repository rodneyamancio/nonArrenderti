import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { CipherService } from '../../common/cipher.service';
import { DomainBadRequest } from '../../common/errors/domain-exceptions';
import { PrismaService } from '../../common/prisma.service';
import { parseBody } from '../../common/validation';

const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v), 'URL inválida');
const emailOrEmpty = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido');

/**
 * Integrations editable by the platform admin (vg-segredos): config is plain JSON,
 * secrets are write-only and stored encrypted, bound to the integration key.
 */
export const INTEGRATIONS = {
  resend: {
    config: z.object({
      fromEmail: emailOrEmpty.default(''),
      fromName: z.string().trim().max(120).default('Tenace'),
      replyTo: emailOrEmpty.default(''),
    }),
    secretKeys: ['apiKey'] as const,
  },
  calebepay: {
    config: z.object({
      apiUrl: url.default('https://api.calebepay.com.br'),
      /** Calebe Pay cost center for every charge Tenace creates ('' = none). */
      costCenterId: z
        .string()
        .trim()
        .max(64)
        .refine((v) => v === '' || /^cc_[A-Za-z0-9_-]+$/.test(v), 'Centro de custo inválido (cc_…)')
        .default(''),
    }),
    secretKeys: ['apiKey', 'webhookSecret'] as const,
  },
} as const;

export type IntegrationKey = keyof typeof INTEGRATIONS;
export const INTEGRATION_KEYS = Object.keys(INTEGRATIONS) as IntegrationKey[];
export type IntegrationConfig<K extends IntegrationKey> = z.infer<(typeof INTEGRATIONS)[K]['config']>;

export function isIntegrationKey(v: string): v is IntegrationKey {
  return v in INTEGRATIONS;
}

export interface LoadedIntegration<K extends IntegrationKey> {
  key: K;
  enabled: boolean;
  config: IntegrationConfig<K>;
  secrets: Record<string, string>;
  updatedAt: Date | null;
}

export const updateIntegrationSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.unknown()).default({}),
  /** undefined = keep · '' = clear · value = replace. Secrets are never returned. */
  secrets: z.record(z.string().max(2000)).default({}),
});

/** "cp_test_…a1b2": enough to recognize which key is saved, never enough to use it. */
export function secretHint(s: string): string {
  if (s.length <= 12) return '••••';
  const prefix = /^[a-z]{2,4}_(live|test|key)_/.exec(s)?.[0] ?? s.slice(0, 3);
  return `${prefix}…${s.slice(-4)}`;
}

@Injectable()
export class IntegrationsService {
  private cache = new Map<IntegrationKey, { at: number; value: LoadedIntegration<IntegrationKey> }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: CipherService,
  ) {}

  /** Full integration including decrypted secrets — server-side only, never returned to clients. */
  async load<K extends IntegrationKey>(key: K): Promise<LoadedIntegration<K>> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 10_000) return cached.value as unknown as LoadedIntegration<K>;
    const row = await this.prisma.integrationSetting.findUnique({ where: { key } });
    const config = INTEGRATIONS[key].config.parse((row?.config as Record<string, unknown> | undefined) ?? {}) as IntegrationConfig<K>;
    const secrets = row?.secrets ? this.cipher.decryptJson<Record<string, string>>(row.secrets, `integration:${key}`) : {};
    const value: LoadedIntegration<K> = { key, enabled: row?.enabled ?? false, config, secrets, updatedAt: row?.updatedAt ?? null };
    this.cache.set(key, { at: Date.now(), value: value as unknown as LoadedIntegration<IntegrationKey> });
    return value;
  }

  /** Safe view for the admin screen: secrets reduced to "set + hint". */
  async publicView(key: IntegrationKey) {
    const it = await this.load(key);
    const keys = INTEGRATIONS[key].secretKeys as readonly string[];
    return {
      key,
      enabled: it.enabled,
      config: it.config,
      secrets: Object.fromEntries(keys.map((k) => [k, it.secrets[k] ? { set: true, hint: secretHint(it.secrets[k]) } : { set: false, hint: '' }])),
      updatedAt: it.updatedAt?.toISOString() ?? null,
    };
  }

  async update(key: IntegrationKey, input: z.infer<typeof updateIntegrationSchema>, userId: string) {
    const current = await this.load(key);
    const config = parseBody(INTEGRATIONS[key].config, { ...(current.config as object), ...input.config });
    const allowed = INTEGRATIONS[key].secretKeys as readonly string[];
    const secrets = { ...current.secrets };
    for (const [k, v] of Object.entries(input.secrets)) {
      if (!allowed.includes(k)) throw new DomainBadRequest('validation_error', `Segredo desconhecido: ${k}`);
      if (v === '') delete secrets[k];
      else secrets[k] = v.trim();
    }
    const encrypted = Object.keys(secrets).length ? this.cipher.encryptJson(secrets, `integration:${key}`) : null;
    await this.prisma.integrationSetting.upsert({
      where: { key },
      create: { key, enabled: input.enabled, config: config as Prisma.InputJsonValue, secrets: encrypted, updatedBy: userId },
      update: { enabled: input.enabled, config: config as Prisma.InputJsonValue, secrets: encrypted, updatedBy: userId },
    });
    this.cache.delete(key);
    return this.publicView(key);
  }
}
