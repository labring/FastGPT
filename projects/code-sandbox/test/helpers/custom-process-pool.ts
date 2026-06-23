import { join } from 'path';
import { BaseProcessPool } from '../../src/pool/base-process-pool';

export class CustomModuleProcessPool extends BaseProcessPool {
  constructor(
    language: 'JS',
    allowedModules: readonly string[],
    options: { recycleAfterTask?: boolean } = {}
  ) {
    super(1, {
      name: `Custom${language}`,
      workerScript: join(process.cwd(), 'src/pool', 'worker.ts'),
      spawnCommand: (script) => `exec tsx ${script}`,
      allowedModules,
      recycleAfterTask: options.recycleAfterTask
    });
  }
}

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 5000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(100);
  }
  return predicate();
}

export async function waitForPidExit(pid: number, timeoutMs = 5000): Promise<boolean> {
  return waitForCondition(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  }, timeoutMs);
}

export function getWorkerPid(pool: BaseProcessPool): number | undefined {
  return (pool as unknown as { workers?: Array<{ proc?: { pid?: number } }> }).workers?.[0]?.proc
    ?.pid;
}
