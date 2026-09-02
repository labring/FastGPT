import { existsSync } from 'fs';
import { platform } from 'os';
import { join } from 'path';

export const JS_SANDBOX_ROOT = '/tmp/fastgpt-js-sandbox';
export const JS_SANDBOX_UID = 65538;
export const JS_SANDBOX_GID = 65538;

export function shouldEnableJsNativeIsolation(): boolean {
  return platform() === 'linux';
}

/**
 * 校验 Linux JS worker 启动所需的原生隔离资产。
 *
 * chroot/降权是 Linux 多租户边界的一部分，不能在资产缺失时静默退化；seccomp
 * 默认启用且失败时 fail-closed，只有部署者显式配置后才跳过。非 Linux 仅用于
 * 本地开发，不声明具备 OS 级隔离。
 */
export function assertJsNativeIsolationReady(addonPath: string): void {
  if (!shouldEnableJsNativeIsolation()) return;

  if (!existsSync(addonPath)) {
    throw new Error(`JS native sandbox addon does not exist: ${addonPath}`);
  }
  if (!existsSync(JS_SANDBOX_ROOT)) {
    throw new Error(`JS sandbox root does not exist: ${JS_SANDBOX_ROOT}`);
  }
}

export function getBundledJsNativeAddonPath(dirname: string): string {
  return join(dirname, 'fastgpt_js_sandbox.node');
}
