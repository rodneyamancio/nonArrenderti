import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EnvService } from './env.service';

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

/** StorageProvider: local disk volume (UPLOAD_DIR). An S3 implementation can replace it behind the same API. */
@Injectable()
export class StorageService {
  private readonly root: string;
  constructor(envs: EnvService) {
    this.root = path.resolve(envs.env.UPLOAD_DIR);
  }

  /** Detects the image type by magic bytes (never trusts the client's content-type). */
  sniff(buf: Buffer): { mime: string; ext: string } | null {
    const s = SIGNATURES.find((x) => x.test(buf));
    return s ? { mime: s.mime, ext: s.ext } : null;
  }

  async save(groupId: string, id: string, ext: string, buf: Buffer): Promise<string> {
    const rel = path.join(groupId, `${id}.${ext}`);
    const abs = path.join(this.root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, buf, { mode: 0o640 });
    return rel;
  }

  async read(rel: string): Promise<Buffer> {
    const abs = path.resolve(this.root, rel);
    if (!abs.startsWith(this.root + path.sep)) throw new Error('path escape');
    return readFile(abs);
  }
}
