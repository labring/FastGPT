/**
 * ProcessPool - JS one-shot 子进程池
 *
 * 继承 BaseProcessPool，提供 JS 子进程入口、原生隔离和固定任务后回收配置。
 * dev（tsx 直接跑 .ts 源码）：worker.ts + tsx
 * prod（tsdown 打包后）：worker.js + node
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { env } from '../env';
import { BaseProcessPool } from './base-process-pool';
import {
  assertJsNativeIsolationReady,
  getBundledJsNativeAddonPath,
  JS_SANDBOX_GID,
  JS_SANDBOX_ROOT,
  JS_SANDBOX_UID,
  shouldEnableJsNativeIsolation
} from '../isolated/js-isolation-config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isCompiled = import.meta.url.endsWith('.js');

const WORKER_SCRIPT = join(__dirname, isCompiled ? 'worker.js' : 'worker.ts');
const SPAWN_RUNTIME = isCompiled ? 'node' : 'tsx';
const NATIVE_SANDBOX_ADDON = getBundledJsNativeAddonPath(__dirname);

export class ProcessPool extends BaseProcessPool {
  constructor(poolSize?: number) {
    assertJsNativeIsolationReady(NATIVE_SANDBOX_ADDON);
    const nativeIsolation = shouldEnableJsNativeIsolation();
    super(poolSize, {
      name: 'JS',
      workerScript: WORKER_SCRIPT,
      spawnCommand: (script) => `exec ${SPAWN_RUNTIME} ${script}`,
      allowedModules: env.SANDBOX_JS_ALLOWED_MODULES,
      // 任何接触过用户代码的进程都不回到 idle 池。
      recycleAfterTask: true,
      spawnCwd: nativeIsolation ? JS_SANDBOX_ROOT : undefined,
      initPayload: {
        nativeIsolation: {
          enabled: nativeIsolation,
          addonPath: NATIVE_SANDBOX_ADDON,
          uid: JS_SANDBOX_UID,
          gid: JS_SANDBOX_GID,
          cwd: '/app/code-sandbox'
        }
      }
    });
  }
}
