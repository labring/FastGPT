/**
 * ProcessPool - JS (Bun) 子进程池
 *
 * 继承 BaseProcessPool，提供 Bun worker 的 spawn 配置。
 */
import { join } from 'path';
import { config } from '../config';
import { BaseProcessPool } from './base-process-pool';

const WORKER_SCRIPT = join(
  typeof import.meta.dir === 'string' ? import.meta.dir : new URL('.', import.meta.url).pathname,
  'worker.ts'
);

export class ProcessPool extends BaseProcessPool {
  constructor(poolSize?: number) {
    super(poolSize, {
      name: 'JS',
      workerScript: WORKER_SCRIPT,
      spawnCommand: (script) => `exec bun run ${script}`,
      allowedModules: config.jsAllowedModules
    });
  }
}
