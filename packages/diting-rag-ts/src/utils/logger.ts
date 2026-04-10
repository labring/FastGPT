// src/utils/logger.ts
// 全局 Logger 单例 - 供 skills/utils 直接使用，无需参数传递

import type { Logger } from '../ports/logger';

let _global: Logger | undefined;

export function setGlobalLogger(logger: Logger): void {
  _global = logger;
}

export function getLogger(): Logger | undefined {
  return _global;
}
