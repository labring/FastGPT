import { createNextRouter } from '@ts-rest/next';
import { createNextRoute } from '@ts-rest/next';
import { contract } from './contracts';

/**
 * 创建 FastGPT 单个路由
 */
export function createServerRoute(
  implementation: Parameters<typeof createNextRoute<typeof contract>>[1]
) {
  return createNextRoute(contract, implementation);
}

/**
 * 创建 FastGPT 路由器
 */
export function createServerRouter(
  router: Parameters<typeof createNextRouter<typeof contract>>[1]
) {
  return createNextRouter(contract, router);
}
