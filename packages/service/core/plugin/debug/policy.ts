import { isDebugToolSource } from '@fastgpt/global/core/app/tool/utils';
import { ApiHttpError } from '../../../common/http/apiError';
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/runtime';

/** 每次读取管理员开关，关闭后不再发现、建立或运行调试通道；不取消已在执行的请求。 */
export const isPluginRemoteDebugEnabled = () =>
  getSystemInstanceConfig().subservice.plugin.remoteDebug;

const PLUGIN_REMOTE_DEBUG_DISABLED_MESSAGE = 'Plugin remote debugging is disabled';

/** 调试连接入口使用明确的拒绝状态，防止绕过前端直接建立或续签连接。 */
export const assertPluginRemoteDebugEnabled = () => {
  if (!isPluginRemoteDebugEnabled()) {
    throw new ApiHttpError(403, PLUGIN_REMOTE_DEBUG_DISABLED_MESSAGE);
  }
};

/** 仅识别关闭调试开关产生的拒绝，供目录候选失效处理使用；其他 403 仍按服务错误抛出。 */
export const isPluginRemoteDebugDisabledError = (error: unknown): boolean =>
  error instanceof ApiHttpError &&
  error.statusCode === 403 &&
  error.message === PLUGIN_REMOTE_DEBUG_DISABLED_MESSAGE;

/** 对显式调试 source 在元数据和执行 I/O 前重新准入，系统及团队来源不受该开关影响。 */
export const assertPluginDebugSourceEnabled = (source?: string) => {
  if (isDebugToolSource(source)) assertPluginRemoteDebugEnabled();
};
