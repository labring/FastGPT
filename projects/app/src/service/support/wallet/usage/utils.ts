import { ModelTypeEnum, getModelMap } from '@fastgpt/service/core/ai/model';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

export function authType2UsageSource({
  authType,
  shareId,
  source
}: {
  authType?: `${AuthUserTypeEnum}`;
  shareId?: string;
  source?: `${UsageSourceEnum}`;
}) {
  if (source) return source;
  if (shareId) return UsageSourceEnum.shareLink;
  if (authType === AuthUserTypeEnum.apikey) return UsageSourceEnum.api;
  return UsageSourceEnum.fastgpt;
}

export const formatModelChars2Points = ({
  model,
  charsLength = 0,
  modelType,
  multiple = 1000
}: {
  model: string;
  charsLength: number;
  modelType: `${ModelTypeEnum}`;
  multiple?: number;
}) => {
  const modelData = getModelMap?.[modelType]?.(model);
  if (!modelData)
    return {
      totalPoints: 0,
      modelName: ''
    };

  const totalPoints = (modelData.charsPointsPrice || 0) * (charsLength / multiple);

  return {
    modelName: modelData.name,
    totalPoints
  };
};
