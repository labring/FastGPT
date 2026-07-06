import type { NextApiResponse } from 'next';
import type { ApiRequestProps } from '../../type/next';
import { jsonRes } from '../response';

type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

/**
 * 限制 NextAPI 路由允许的 HTTP method。
 * method 不匹配时直接返回 405，并写入 Allow header，避免后续业务 handler 继续执行。
 */
export function useAllowedMethods(...methods: HttpMethod[]) {
  const allowedMethods = methods.map((method) => method.toUpperCase());

  return async (req: ApiRequestProps, res: NextApiResponse) => {
    const requestMethod = req.method?.toUpperCase() ?? '';

    if (allowedMethods.includes(requestMethod)) {
      return;
    }

    res.setHeader('Allow', allowedMethods.join(', '));
    jsonRes(res, {
      code: 405,
      message: `Method ${requestMethod || 'UNKNOWN'} Not Allowed`
    });
  };
}
