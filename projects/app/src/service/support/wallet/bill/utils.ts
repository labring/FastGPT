import { ModelTypeEnum, getModelMap } from '@/service/core/ai/model';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';

export function authType2BillSource({
  authType,
  shareId,
  source
}: {
  authType?: `${AuthUserTypeEnum}`;
  shareId?: string;
  source?: `${BillSourceEnum}`;
}) {
  if (source) return source;
  if (shareId) return BillSourceEnum.shareLink;
  if (authType === AuthUserTypeEnum.apikey) return BillSourceEnum.api;
  return BillSourceEnum.fastgpt;
}

export const countModelPrice = ({
  model,
  tokens,
  type
}: {
  model: string;
  tokens: number;
  type: `${ModelTypeEnum}`;
}) => {
  const modelData = getModelMap?.[type]?.(model);
  if (!modelData) return 0;
  return modelData.price * tokens;
};
