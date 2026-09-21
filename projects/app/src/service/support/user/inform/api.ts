import { postSendInform } from '@fastgpt/service/thirdProvider/fastgptPro/api';
import { type SendInform2UserProps } from '@fastgpt/global/support/user/inform/type';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

export function sendOneInform(data: SendInform2UserProps) {
  if (!FastGPTProUrl) return;
  return postSendInform(data);
}
