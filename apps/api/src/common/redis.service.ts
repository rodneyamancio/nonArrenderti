import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { DomainTooMany, DomainUnavailable } from './errors/domain-exceptions';
import { EnvService } from './env.service';

export interface RateLimitRule {
  key: string;
  limit: number;
  windowSec: number;
  /** closed = refuse when Redis is down (login); open = let through and log (public traffic). */
  onFailure: 'open' | 'closed';
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  readonly client: Redis;

  constructor(env: EnvService) {
    this.client = new Redis(env.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    this.client.on('error', (e) => this.logger.warn(`redis: ${e.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  /** Fixed-window counter. Throws 429 over the limit. */
  async hit(rule: RateLimitRule): Promise<void> {
    let count: number;
    let ttl: number;
    try {
      const k = `rl:${rule.key}`;
      const res = await this.client.multi().incr(k).expire(k, rule.windowSec, 'NX').ttl(k).exec();
      count = Number(res?.[0]?.[1] ?? 0);
      ttl = Number(res?.[2]?.[1] ?? rule.windowSec);
    } catch (e) {
      if (rule.onFailure === 'closed') throw new DomainUnavailable('service_unavailable', 'Serviço temporariamente indisponível');
      this.logger.warn(`rate limit skipped (${rule.key}): ${(e as Error).message}`);
      return;
    }
    if (count > rule.limit) throw new DomainTooMany(ttl > 0 ? ttl : rule.windowSec);
  }

  async reset(key: string): Promise<void> {
    await this.client.del(`rl:${key}`).catch(() => undefined);
  }
}
