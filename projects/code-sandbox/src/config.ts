/**
 * 配置入口 - 从 env.ts 重新导出
 *
 * 保持向后兼容：其他模块继续 import { config } from './config'
 */
import { env } from './env';

export const config = env;
