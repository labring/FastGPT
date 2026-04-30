/**
 * ProcessPool - JS 子进程池
 *
 * 继承 BaseProcessPool，提供 JS worker 的 spawn 配置。
 * dev（tsx 直接跑 .ts 源码）：worker.ts + tsx
 * prod（tsdown 打包后）：worker.js + node
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config';
import { BaseProcessPool } from './base-process-pool';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isCompiled = import.meta.url.endsWith('.js');

const WORKER_SCRIPT = join(__dirname, isCompiled ? 'worker.js' : 'worker.ts');
const SPAWN_RUNTIME = isCompiled ? 'node' : 'tsx';

export class ProcessPool extends BaseProcessPool {
  constructor(poolSize?: number) {
    super(poolSize, {
      name: 'JS',
      workerScript: WORKER_SCRIPT,
      spawnCommand: (script) => `exec ${SPAWN_RUNTIME} ${script}`,
      allowedModules: config.jsAllowedModules
    });
  }
}
