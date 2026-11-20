import { hash, verify } from '@node-rs/argon2';

// OWASP Argon2id baseline (m=19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** Used when the e-mail does not exist, so timing does not reveal registered accounts. */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword('not-a-real-password-' + Math.random());
  return dummy;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'A senha precisa de ao menos 8 caracteres';
  if (password.length > 200) return 'Senha muito longa';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Use letras e números na senha';
  return null;
}
