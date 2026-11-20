import type { z } from 'zod';
import { DomainBadRequest } from './errors/domain-exceptions';

/** Zod at every edge. Throws 400 validation_error with field paths (never echoes values). */
export function parseBody<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issues = r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new DomainBadRequest('validation_error', 'Dados inválidos', { issues });
  }
  return r.data;
}
