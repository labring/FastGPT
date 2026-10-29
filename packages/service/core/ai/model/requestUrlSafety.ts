import { UserError } from '@fastgpt/global/common/error/utils';
import { checkUrlSafety } from '../../../common/system/utils';

/**
 * 团队模型自定义端点的写入前校验。
 * 空值表示不配置端点，直接放行；其余情况复用统一的 URL 安全检查
 * （合法 URL、http/https、命中内网/云元数据时拒绝）。
 */
export const assertTeamModelRequestUrlSafe = async (modelData: {
  requestUrl?: unknown;
}): Promise<void> => {
  if (typeof modelData.requestUrl !== 'string') return;

  const requestUrl = modelData.requestUrl.trim();
  if (!requestUrl) return;

  try {
    await checkUrlSafety(requestUrl, 'requestUrl');
  } catch (error) {
    throw new UserError(error instanceof Error ? error.message : String(error));
  }
};
