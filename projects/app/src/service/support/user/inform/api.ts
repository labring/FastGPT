import { POST } from '@fastgpt/service/common/api/plusRequest';
import { SendInformProps } from '@fastgpt/global/support/user/inform/type';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

export function sendOneInform(data: SendInformProps) {
  if (!FastGPTProUrl) return;
  return POST('/support/user/inform/create', data);
}
