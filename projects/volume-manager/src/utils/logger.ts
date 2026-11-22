import { env } from '../env';

export function logInfo(msg: string, ...args: unknown[]): void {
  if (env.VM_LOG_LEVEL === 'none') return;
  console.log(`[volume-manager] ${msg}`, ...args);
}

export function logDebug(msg: string, ...args: unknown[]): void {
  if (env.VM_LOG_LEVEL !== 'debug') return;
  console.log(`[volume-manager:debug] ${msg}`, ...args);
}

export function logError(msg: string, ...args: unknown[]): void {
  if (env.VM_LOG_LEVEL === 'none') return;
  console.error(`[volume-manager:error] ${msg}`, ...args);
}
