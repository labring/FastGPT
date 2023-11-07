import { POST } from '@fastgpt/service/common/api/plusRequest';
import { SendInformProps } from '@fastgpt/global/support/user/inform/type';

export function sendOneInform(data: SendInformProps) {
  if (!global.systemEnv.pluginBaseUrl) return;
  return POST('/support/user/inform/create', data);
}
