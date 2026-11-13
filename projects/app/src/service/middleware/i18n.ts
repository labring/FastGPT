import { createApiI18n } from '@fastgpt/service/common/i18n/request';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import type { NodeHttpRequest, NodeHttpResponse } from '@fastgpt/service/types/http';

/** 应用资源仅在适配层注入，所有 API 共用按语言缓存的翻译函数。 */
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
