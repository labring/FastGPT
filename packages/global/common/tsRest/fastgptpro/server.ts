import { proContract } from './contracts';
import { createNextRoute, createNextRouter } from '@ts-rest/next';

/**
 * 创建 Pro 单个路由
 */
export function createProServerRoute(
  implementation: Parameters<typeof createNextRoute<typeof proContract>>[1]
) {
  return createNextRoute(proContract, implementation);
}

/**
 * 创建 Pro 路由器
 * 只需实现 Pro 接口（路径已自动转换 /proApi → 空）
 */
export function createProServerRouter(
  router: Parameters<typeof createNextRouter<typeof proContract>>[1]
) {
  return createNextRouter(proContract, router);
}
