/**
 * PythonProcessPool - Python 子进程池
 *
 * 继承 BaseProcessPool，提供 Python worker 的 spawn 配置。
 */
import { join } from 'path';
import { config } from '../config';
import { BaseProcessPool } from './base-process-pool';

const WORKER_SCRIPT = join(
  typeof import.meta.dir === 'string' ? import.meta.dir : new URL('.', import.meta.url).pathname,
  'worker.py'
);

export class PythonProcessPool extends BaseProcessPool {
  constructor(poolSize?: number) {
    super(poolSize, {
      name: 'Python',
      workerScript: WORKER_SCRIPT,
      spawnCommand: (script) => `exec python3 -u ${script}`,
      allowedModules: config.pythonAllowedModules
    });
  }
}
