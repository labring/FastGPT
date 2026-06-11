import type { NextApiResponse } from 'next';
import type { ApiRequestProps } from '../../type/next';
import { jsonRes } from '../response';

export type ApiRequestMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

type ApiRequestMethodInput = ApiRequestMethod | ApiRequestMethod[];

type RejectUnsupportedMethodProps = {
  req: ApiRequestProps;
  res: NextApiResponse;
  methods: ApiRequestMethodInput;
};

const normalizeMethods = (methods: ApiRequestMethodInput) =>
  Array.isArray(methods) ? methods : [methods];

/**
 * 校验 API 请求是否命中允许的 HTTP method，失败时直接返回 405。
 *
 * 该函数用于 API 边界的协议校验，避免错误 method 继续进入鉴权、外部服务调用或状态变更逻辑。
 */
export function rejectUnsupportedMethod({
  req,
  res,
  methods
}: RejectUnsupportedMethodProps): boolean {
  const allowedMethods = normalizeMethods(methods);
  const requestMethod = req.method?.toUpperCase();

  if (requestMethod && allowedMethods.includes(requestMethod as ApiRequestMethod)) {
    return false;
  }

  res.setHeader('Allow', allowedMethods.join(', '));
  jsonRes(res, { code: 405, error: 'Method not allowed' });
  return true;
}

/**
 * NextAPI 前置中间件：只允许指定 HTTP method 继续执行后续 handler。
 *
 * 兼容单个 method、method 数组以及可变参数写法，便于主仓库和 pro 子仓库复用。
 */
export function useAllowedMethods(
  methods: ApiRequestMethodInput
): (req: ApiRequestProps, res: NextApiResponse) => Promise<boolean>;
export function useAllowedMethods(
  ...methods: ApiRequestMethod[]
): (req: ApiRequestProps, res: NextApiResponse) => Promise<boolean>;
export function useAllowedMethods(
  firstMethod: ApiRequestMethodInput,
  ...restMethods: ApiRequestMethod[]
) {
  const methods = restMethods.length
    ? [firstMethod as ApiRequestMethod, ...restMethods]
    : firstMethod;

  return async (req: ApiRequestProps, res: NextApiResponse) =>
    rejectUnsupportedMethod({ req, res, methods });
}
