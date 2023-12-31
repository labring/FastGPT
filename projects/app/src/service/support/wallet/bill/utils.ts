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
  inputLen = 0,
  outputLen = 0,
  type,
  multiple = 1000
}: {
  model: string;
  inputLen: number;
  outputLen?: number;
  type: `${ModelTypeEnum}`;
  multiple?: number;
}) => {
  const modelData = getModelMap?.[type]?.(model);
  if (!modelData)
    return {
      inputTotal: 0,
      outputTotal: 0,
      total: 0,
      modelName: ''
    };
  const inputTotal = modelData.inputPrice
    ? Math.ceil(modelData.inputPrice * (inputLen / multiple) * PRICE_SCALE)
    : 0;
  const outputTotal = modelData.outputPrice
    ? Math.ceil(modelData.outputPrice * (outputLen / multiple) * PRICE_SCALE)
    : 0;

  return {
    modelName: modelData.name,
    inputTotal: inputTotal,
    outputTotal: outputTotal,
    total: inputTotal + outputTotal
  };
};
