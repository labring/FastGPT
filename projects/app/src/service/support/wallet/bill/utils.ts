import { ModelTypeEnum, getModelMap } from '@/service/core/ai/model';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { BillSourceEnum, PRICE_SCALE } from '@fastgpt/global/support/wallet/bill/constants';

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

export const formatModelPrice2Store = ({
  model,
  dataLen,
  type,
  multiple = 1000
}: {
  model: string;
  dataLen: number;
  type: `${ModelTypeEnum}`;
  multiple?: number;
}) => {
  const modelData = getModelMap?.[type]?.(model);
  if (!modelData)
    return {
      total: 0,
      modelName: ''
    };
  const total = Math.ceil(modelData.price * (dataLen / multiple) * PRICE_SCALE);

  return {
    modelName: modelData.name,
    total: total > 1 ? total : 1
  };
};
