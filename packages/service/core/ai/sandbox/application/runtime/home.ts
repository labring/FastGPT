/**
 * 沙盒业务层：解析运行中 sandbox 的 HOME 目录。
 *
 * 只读取当前实例的环境状态，不把 HOME 固化到 provider profile。
 */
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);
const homeDirectoryPromiseBySandbox = new WeakMap<ISandbox, Promise<string | undefined>>();

/**
 * 从实际 sandbox 环境解析 HOME。
 *
 * HOME 属于镜像/运行用户的运行时状态，不应由 provider profile 静态维护。
 * 解析失败时返回 undefined，让调用方按场景决定是否降级。
 */
export const resolveSandboxHome = (sandbox: ISandbox): Promise<string | undefined> => {
  const cachedPromise = homeDirectoryPromiseBySandbox.get(sandbox);
  if (cachedPromise) return cachedPromise;

  const homeDirectoryPromise = (async () => {
    const homeResult = await sandbox
      .execute('printf "%s" "$HOME"', {
        timeoutMs: 5_000,
        maxOutputBytes: 1024
      })
      .catch(() => undefined);

    const homeFromEnv = homeResult?.exitCode === 0 ? homeResult.stdout.trim() : '';
    if (homeFromEnv) return homeFromEnv;

    const fallbackResult = await sandbox
      .execute('sh -c "echo ~"', {
        timeoutMs: 5_000,
        maxOutputBytes: 1024
      })
      .catch((error) => {
        logger.warn('[Sandbox] Failed to resolve HOME from shell fallback', { error });
        return undefined;
      });

    const fallbackHome = fallbackResult?.exitCode === 0 ? fallbackResult.stdout.trim() : '';
    if (fallbackHome) return fallbackHome;

    logger.warn('[Sandbox] Failed to resolve HOME');
  })();
  homeDirectoryPromiseBySandbox.set(sandbox, homeDirectoryPromise);

  // 只缓存稳定的 HOME；空结果或异常允许同一实例在后续链路中重试。
  void homeDirectoryPromise.then(
    (homeDirectory) => {
      if (!homeDirectory && homeDirectoryPromiseBySandbox.get(sandbox) === homeDirectoryPromise) {
        homeDirectoryPromiseBySandbox.delete(sandbox);
      }
    },
    () => {
      if (homeDirectoryPromiseBySandbox.get(sandbox) === homeDirectoryPromise) {
        homeDirectoryPromiseBySandbox.delete(sandbox);
      }
    }
  );

  return homeDirectoryPromise;
};
