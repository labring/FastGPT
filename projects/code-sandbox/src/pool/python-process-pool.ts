/**
 * PythonProcessPool - Python 子进程池
 *
 * 继承 BaseProcessPool，提供 Python worker 的 spawn 配置。
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { env } from '../env';
import { BaseProcessPool } from './base-process-pool';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = join(__dirname, 'worker.py');
const RECYCLE_AFTER_TASK_MODULES = new Set([
  'subprocess',
  'multiprocessing',
  'threading',
  'concurrent'
]);

function shouldRecycleAfterTask(allowedModules: readonly string[]): boolean {
  return allowedModules.some((moduleName) => RECYCLE_AFTER_TASK_MODULES.has(moduleName));
}

export class PythonProcessPool extends BaseProcessPool {
  constructor(poolSize?: number) {
    super(poolSize, {
      name: 'Python',
      workerScript: WORKER_SCRIPT,
      spawnCommand: (script) => `exec python3 -u ${script}`,
      allowedModules: env.SANDBOX_PYTHON_ALLOWED_MODULES,
      recycleAfterTask: shouldRecycleAfterTask(env.SANDBOX_PYTHON_ALLOWED_MODULES)
    });
  }
}
