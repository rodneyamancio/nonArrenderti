import { Injectable } from '@nestjs/common';
import { Cipher } from './crypto';
import { EnvService } from './env.service';

@Injectable()
export class CipherService extends Cipher {
  constructor(env: EnvService) {
    super(env.env.ENCRYPTION_KEY);
  }
  encryptJson(value: unknown, aad: string): string {
    return this.encrypt(JSON.stringify(value), aad);
  }
  decryptJson<T>(payload: string, aad: string): T {
    return JSON.parse(this.decrypt(payload, aad)) as T;
  }
}
