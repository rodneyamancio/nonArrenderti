import { Injectable } from '@nestjs/common';
import { type Env, loadEnv } from '../config/env.schema';

@Injectable()
export class EnvService {
  readonly env: Env = loadEnv();
  get isProd(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
