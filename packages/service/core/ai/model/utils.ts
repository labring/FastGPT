import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { UpdateQuery } from 'mongoose';
import { isProVersion } from '../../../common/system/constants';
import { checkUrlSafety } from '../../../common/system/utils';
import type { AIModelSchemaType } from '../type';

export type EditableModelData = Omit<AIModelDocumentDataType, 'model'> & {
  model?: string;
};

const optionalModelConfigFields = ['requestUrl', 'requestAuth', 'testMode', 'pricing'] as const;

/**
 * 生成模型配置的替换式更新表达式，清除缺失的可选字段并保护类型、归属和展示顺序。
 * sortOrder 仅由排序接口维护，配置更新即使显式携带该字段也不修改或清除已有 rank。
 */
export const getModelConfigUpdate = (
  modelData: EditableModelData
): UpdateQuery<AIModelSchemaType> => {
  const mutableModelData = { ...modelData } as Record<string, unknown>;
  delete mutableModelData.type;
  delete mutableModelData.scope;
  delete mutableModelData.tmbId;
  delete mutableModelData.teamId;
  delete mutableModelData._id;
  delete mutableModelData.modelId;
  delete mutableModelData.sortOrder;

  if (typeof mutableModelData.model === 'string') {
    const trimmed = mutableModelData.model.trim();
    if (trimmed.length > 0) {
      mutableModelData.model = trimmed;
    } else {
      delete mutableModelData.model;
    }
  } else {
    delete mutableModelData.model;
  }

  const fieldsToUnset = optionalModelConfigFields.filter((field) => {
    const value = mutableModelData[field];
    const isEmptyRequestConfig =
      (field === 'requestUrl' || field === 'requestAuth') &&
      typeof value === 'string' &&
      value.trim().length === 0;

    if (!(field in mutableModelData) || value === undefined || isEmptyRequestConfig) {
      delete mutableModelData[field];
      return true;
    }
    return false;
  });

  return {
    $set: mutableModelData,
    ...(fieldsToUnset.length > 0
      ? {
          $unset: Object.fromEntries(fieldsToUnset.map((field) => [field, 1 as const])) as Record<
            string,
            1
          >
        }
      : {})
  } as UpdateQuery<AIModelSchemaType>;
};

/**
 * 团队私有模型不允许配置测试模式、下架预警等运营字段；
 * 自定义请求地址与鉴权 (requestUrl/requestAuth) 作为升级过渡期能力保留。
 * 返回剔除这些字段后的新对象，不修改入参。
 */
export const sanitizeTeamModelData = <T extends object>(
  modelData: T
): Omit<T, 'testMode' | 'tmbId' | 'teamId' | 'isUpcomingDeprecation'> => {
  const { testMode, tmbId, teamId, isUpcomingDeprecation, ...rest } = modelData as T & {
    testMode?: unknown;
    isUpcomingDeprecation?: unknown;
    tmbId?: unknown;
    teamId?: unknown;
  };
  return rest;
};

/** 团队私有模型与渠道是商业版功能；停用时拒绝管理入口，系统模型不受此开关限制。 */
export const assertTeamModelEnabled = async () => {
  if (!isProVersion()) throw SystemErrEnum.commercialFeature;
  if (global.feConfigs?.enable_team_model === false) throw ModelErrEnum.teamModelDisabled;
};

/**
 * 团队模型自定义端点的写入前校验。
 * 空值表示不配置端点，直接放行；其余情况复用统一的 URL 安全检查
 * （合法 URL、http/https、命中内网/云元数据时拒绝）。
 */
export const assertTeamModelRequestUrlSafe = async (modelData: {
  requestUrl?: unknown;
}): Promise<void> => {
  if (typeof modelData.requestUrl !== 'string') return;
  const requestUrl = modelData.requestUrl.trim();
  if (!requestUrl) return;

  try {
    await checkUrlSafety(requestUrl, 'requestUrl');
  } catch (error) {
    throw new UserError(error instanceof Error ? error.message : String(error));
  }
};
