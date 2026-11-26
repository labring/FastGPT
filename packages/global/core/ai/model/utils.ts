import { ModelScopeEnum, ModelTypeEnum } from '../constants';
import type { AIModelDocumentDataType } from './schema';
import type { ChannelType } from './scope';

/**
 * 统一判定模型是否为系统全局模型。
 * 兼容未配置 scope 的旧模型及显式标记 isSystem 的场景。
 */
export const isSystemModel = (model?: {
  scope?: string | ModelScopeEnum;
  isSystem?: boolean;
  tmbId?: unknown;
}): boolean => {
  if (!model) return true;
  if (model.isSystem !== undefined) return Boolean(model.isSystem);
  if (model.scope !== undefined) return model.scope === ModelScopeEnum.system;
  return !model.tmbId;
};

/**
 * 统一判定模型是否为团队成员私有模型。
 */
export const isTeamModel = (model?: {
  scope?: string | ModelScopeEnum;
  isSystem?: boolean;
  tmbId?: unknown;
}): boolean => {
  return !isSystemModel(model);
};

/** 将接口层 channelType 转换为模型存储使用的 ModelScopeEnum。 */
export const channelTypeToScope = (channelType?: ChannelType): ModelScopeEnum =>
  channelType === 'team' ? ModelScopeEnum.team : ModelScopeEnum.system;

/** 将模型存储的 scope 转换为接口层 channelType；缺省视为系统模型。 */
export const scopeToChannelType = (scope?: string | ModelScopeEnum): ChannelType =>
  scope === ModelScopeEnum.team ? 'team' : 'system';

/**
 * 解析一次请求实际操作的作用域：显式 channelType 优先，否则回退到模型自身 scope。
 * 所有需要从「请求声明 + 模型数据」推导作用域的位置都应使用它，避免各处重复三元判断。
 */
export const resolveChannelType = ({
  channelType,
  scope
}: {
  channelType?: ChannelType;
  scope?: string | ModelScopeEnum;
}): ChannelType => channelType ?? scopeToChannelType(scope);

/** embedding 模型是否支持图片输入；未配置时按纯文本模型处理。 */
export const isImageEmbeddingModel = (model?: { config?: { vision?: boolean } }): boolean =>
  model?.config?.vision === true;

/** 提交渠道导入时，将上游限制合入所选模板，保留模板的其他配置。 */
export const mergeChannelTemplateModelData = ({
  template,
  contextLength,
  maxCompletionTokens
}: {
  template: AIModelDocumentDataType;
  contextLength?: number;
  maxCompletionTokens?: number;
}): AIModelDocumentDataType => {
  switch (template.type) {
    case ModelTypeEnum.llm:
      return {
        ...template,
        config: {
          ...template.config,
          ...(contextLength === undefined ? {} : { maxContext: contextLength }),
          ...(maxCompletionTokens === undefined ? {} : { maxResponse: maxCompletionTokens })
        }
      };
    case ModelTypeEnum.embedding:
      return {
        ...template,
        config: {
          ...template.config,
          ...(contextLength === undefined ? {} : { maxToken: contextLength })
        }
      };
    case ModelTypeEnum.rerank:
      return {
        ...template,
        config: {
          ...template.config,
          ...(contextLength === undefined ? {} : { maxToken: contextLength })
        }
      };
    default:
      return { ...template };
  }
};
