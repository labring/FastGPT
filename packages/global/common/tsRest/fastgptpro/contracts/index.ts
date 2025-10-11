import { chatContract } from '../../fastgpt/contracts/core/chat';
import { initContract } from '@ts-rest/core';
const c = initContract();

/**
 * 转换路径前缀
 * 将 /proApi 替换为空字符串，用于 Pro 后端
 */
function transformPaths<T extends Record<string, any>>(
  router: T,
  removePrefix: string = '/proApi',
  replaceWith: string = ''
): T {
  const transform = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) return obj;

    // 如果是路由定义（有 path 属性）
    if ('path' in obj && typeof obj.path === 'string') {
      return {
        ...obj,
        path: obj.path.replace(removePrefix, replaceWith),
        metadata: {
          ...obj.metadata,
          originalPath: obj.path
        }
      };
    }

    // 递归处理嵌套的路由
    const result: any = {};
    for (const key in obj) {
      result[key] = transform(obj[key]);
    }
    return result;
  };

  return transform(router) as T;
}

// 通过 FastGPT 后端转发到 Pro 后端使用的合约
const transformedProContract = c.router({
  chat: transformPaths(chatContract)
});

// Pro 后端独有的接口
const proOnlyContract = c.router({
  // TODO
  // admin: adminContract,
});

// 最终的 Pro 合约 = 转换后的 Pro 接口 + Pro 后端独有的接口
// Pro 后端使用的合约
export const proContract = c.router({
  ...transformedProContract,
  ...proOnlyContract
});
