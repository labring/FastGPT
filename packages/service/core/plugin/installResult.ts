import { UserError } from '@fastgpt/global/common/error/utils';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { PluginInstallFailureType } from '@fastgpt/global/sdk/fastgpt-plugin';

/**
 * 将全量失败的插件安装结果收敛为可读业务异常，
 * 以 HTTP 500 响应并记录请求级 info 日志，避免 200 假成功或向前端暴露原始 JSON。
 */
export const createPluginInstallFailureError = ({
  failed,
  lang
}: {
  failed: PluginInstallFailureType[];
  lang?: string;
}): UserError => {
  const reasons = Array.from(
    new Set(failed.map((item) => parseI18nString(item.reason, lang).trim()).filter(Boolean))
  );
  const message = reasons.join('; ') || 'Install plugin failed';

  return new UserError(message, message);
};
