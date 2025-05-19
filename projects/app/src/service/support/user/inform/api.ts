import { POST } from '@fastgpt/service/common/api/plusRequest';
import { SendInform2UserProps } from '@fastgpt/global/support/user/inform/type';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

export function sendOneInform(data: SendInform2UserProps) {
  if (!FastGPTProUrl) return;
  return POST('/support/user/inform/create', data);
}
