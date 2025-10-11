import { fastgptContract } from './contracts';
import { createNextRoute, createNextRouter } from '@ts-rest/next';

/**
 * 创建 FastGPT 单个路由
 */
export function createServerRoute(
  implementation: Parameters<typeof createNextRoute<typeof fastgptContract>>[1]
) {
  return createNextRoute(fastgptContract, implementation);
}

/**
 * 创建 FastGPT 路由器([...ts-rest])
 */
export function createServerRouter(
  router: Parameters<typeof createNextRouter<typeof fastgptContract>>[1]
) {
  return createNextRouter(fastgptContract, router);
}
