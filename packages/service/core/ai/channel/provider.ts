import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import { getCachedTypeMetas } from './cache';

/** 获取并缓存渠道提供商的表单元数据。 */
export const getChannelTypeMetas = (): Promise<
  Record<number, { defaultBaseUrl: string; keyHelp: string; name: string }>
> => getCachedTypeMetas(() => aiProxyClient.getTypeMetas());
