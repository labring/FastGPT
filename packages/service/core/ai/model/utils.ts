import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { UpdateQuery } from 'mongoose';
import type { SystemModelSchemaType } from '../type';

export type EditableSystemModelData = Omit<SystemModelDocumentDataType, 'model'> & {
  model?: string;
};

const optionalSystemModelConfigFields = [
  'requestUrl',
  'requestAuth',
  'testMode',
  'charsPointsPrice',
  'priceTiers',
  'inputPrice',
  'outputPrice'
] as const;

/**
 * 生成模型配置的替换式更新表达式，清除缺失的可选字段并保护不可修改的 type 与 scope。
 */
export const getSystemModelConfigUpdate = (
  modelData: EditableSystemModelData
): UpdateQuery<SystemModelSchemaType> => {
  const mutableModelData = { ...modelData } as Record<string, unknown>;
  delete mutableModelData.type;
  delete mutableModelData.scope;
  delete mutableModelData.tmbId;
  delete mutableModelData.teamId;
  delete mutableModelData._id;
  delete mutableModelData.modelId;

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

  if (modelData.type === ModelTypeEnum.llm) {
    delete mutableModelData.inputPrice;
    delete mutableModelData.outputPrice;
    delete mutableModelData.charsPointsPrice;
  }

  const fieldsToUnset = optionalSystemModelConfigFields.filter((field) => {
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
  } as UpdateQuery<SystemModelSchemaType>;
};

/**
 * 团队私有模型不允许配置直连地址、鉴权与测试模式（统一走成员渠道），
 * 返回剔除这些字段后的新对象，不修改入参。
 */
export const sanitizeTeamModelData = <T extends object>(
  modelData: T
): Omit<T, 'requestUrl' | 'requestAuth' | 'testMode' | 'tmbId' | 'teamId'> => {
  const { requestUrl, requestAuth, testMode, tmbId, teamId, ...rest } = modelData as T & {
    requestUrl?: unknown;
    requestAuth?: unknown;
    testMode?: unknown;
    tmbId?: unknown;
    teamId?: unknown;
  };
  return rest;
};
