import { BRAND_COLORS } from '@tenace/types';
import { goalProblem, normalizeGoal, pixKeyProblem } from '@tenace/rules';
import { z } from 'zod';

const emoji = z.string().trim().min(1).max(16);

export const goalSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    emoji: emoji.default('🎯'),
    period: z.enum(['daily', 'weekly']),
    target: z.number().int().min(1).max(10_000),
    unit: z.string().trim().min(1).max(20),
    slotsPerWeek: z.number().int().min(1).max(50).optional(),
    stakeCents: z.number().int().min(1).max(100_000_00),
    activeWeekdays: z.array(z.number().int().min(1).max(7)).max(7).default([1, 2, 3, 4, 5, 6, 7]),
    excludedMemberIds: z.array(z.string().max(40)).max(100).default([]),
  })
  .transform((g) => normalizeGoal(g))
  .superRefine((g, ctx) => {
    const p = goalProblem(g);
    if (p) ctx.addIssue({ code: 'custom', path: ['target'], message: p });
  });

export const destinationSchema = z
  .object({
    label: z.string().trim().min(2).max(60),
    holderName: z.string().trim().max(60).default(''),
    pixKeyType: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']).nullable().default(null),
    pixKey: z.string().trim().max(100).default(''),
    bankInfo: z.string().trim().max(300).default(''),
    city: z.string().trim().max(40).default(''),
  })
  .superRefine((d, ctx) => {
    if (d.pixKeyType && d.pixKey) {
      const p = pixKeyProblem(d.pixKeyType, d.pixKey);
      if (p) ctx.addIssue({ code: 'custom', path: ['pixKey'], message: p });
    }
  });

const timezone = z
  .string()
  .max(60)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Fuso horário inválido');

export const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(50),
  emoji: emoji.default('🔥'),
  color: z.enum(BRAND_COLORS).default('violet'),
  description: z.string().trim().max(300).default(''),
  timezone: timezone.default('America/Sao_Paulo'),
  startMode: z.enum(['now', 'next']).default('next'),
  destination: destinationSchema,
  goals: z.array(goalSchema).min(1, 'Crie pelo menos uma meta').max(20),
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  emoji: emoji.optional(),
  color: z.enum(BRAND_COLORS).optional(),
  description: z.string().trim().max(300).optional(),
  timezone: timezone.optional(),
  closeGraceHours: z.number().int().min(0).max(48).optional(),
  destination: destinationSchema.optional(),
});
