import { createApiI18n } from '@fastgpt/service/common/i18n/request';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import type { NodeHttpRequest, NodeHttpResponse } from '@fastgpt/service/types/http';

/** App / Pro 共用的 Next API 翻译入口；资源装配留在适配层，Service 不依赖 Web。 */
export const apiI18n = createApiI18n(generatedLoaders);

/** 仅绑定请求翻译能力，保留流式及授权激活等旁路接口原有的校验与响应生命周期。 */
export const withApiI18n = <
  Request extends Pick<NodeHttpRequest, 'headers'>,
  Response extends NodeHttpResponse,
  T
>(
  handler: (req: Request, res: Response) => T
) => {
  return (req: Request, res: Response) => apiI18n({ req, res }, () => handler(req, res));
};
