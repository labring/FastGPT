import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { ClientSession } from '../../../common/mongo';
import { runSystemModelTransaction } from './entity';
import { MongoAIModel } from './schema';
import { MongoModelStatusProbeRecord } from '../modelStatus/schema';
import { MongoResourcePermission } from '../../../support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { assertModelAvailable } from '../utils';
import { updatedReloadSystemModel } from './catalog';
import { refreshModelTemplates } from './template';
import {
  CreateModelResponseSchema,
  CreateModelsFromTemplatesResponseSchema,
  type CreateModelBody,
  type CreateModelResponse,
  type CreateModelsFromTemplatesBody,
  type CreateModelsFromTemplatesResponse,
  type DeleteModelsBody,
  type UpdateDefaultModelsBody,
  type UpdateModelBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import { getSystemModelConfigUpdate, type EditableSystemModelData } from './utils';

/**
 * 更新一组已存在的系统模型，并保证目标集合完整命中。
 *
 * 该内部入口集中 system scope 和“不允许部分命中”的业务规则；是否开启事务由上层操作决定。
 */
const updateExistingSystemModels = async ({
  modelIds,
  update,
  session,
  scope = ModelScopeEnum.system,
  tmbId
}: {
  modelIds: string[];
  update: EditableSystemModelData | Pick<SystemModelDocumentDataType, 'isActive'>;
  session?: ClientSession;
  scope?: ModelScopeEnum;
  tmbId?: string;
}) => {
  const query: Record<string, any> = { _id: { $in: modelIds }, scope };
  if (scope === ModelScopeEnum.team && tmbId) {
    query.tmbId = tmbId;
  }
  const result = await MongoAIModel.updateMany(query, { $set: update }, { session });

  if (result.matchedCount !== modelIds.length) {
    return Promise.reject(ModelErrEnum.unExist);
  }
};

/** 按稳定 modelId 更新单个系统或团队模型的可编辑配置，并刷新运行时模型快照。 */
export const updateSystemModelConfig = async ({
  modelId,
  modelData,
  scope = ModelScopeEnum.system,
  tmbId
}: {
  modelId: string;
  modelData: EditableSystemModelData;
  scope?: ModelScopeEnum;
  tmbId?: string;
}) => {
  await runSystemModelTransaction(async (session) => {
    const query: Record<string, any> = { _id: modelId, scope };
    if (scope === ModelScopeEnum.team && tmbId) {
      query.tmbId = tmbId;
    }
    const projection: Record<string, number> = { type: 1, model: 1 };
    if (scope === ModelScopeEnum.team) {
      projection.tmbId = 1;
    }
    const existingModel = await MongoAIModel.findOne(query, projection).session(session).lean();
    if (!existingModel) throw ModelErrEnum.unExist;
    if (existingModel.type !== modelData.type) {
      throw new UserError('System model type cannot be changed');
    }

    const trimmedModel = typeof modelData.model === 'string' ? modelData.model.trim() : undefined;
    if (trimmedModel && trimmedModel !== existingModel.model) {
      const duplicateQuery: Record<string, any> = {
        scope,
        model: trimmedModel,
        _id: { $ne: modelId }
      };
      if (scope === ModelScopeEnum.team && existingModel.tmbId) {
        duplicateQuery.tmbId = existingModel.tmbId;
      }
      const duplicate = await MongoAIModel.exists(duplicateQuery).session(session);
      if (duplicate) {
        throw new UserError(ModelErrEnum.alreadyExists);
      }
    }

    const result = await MongoAIModel.updateOne(
      {
        _id: modelId,
        scope,
        type: existingModel.type,
        ...(query.tmbId ? { tmbId: query.tmbId } : {})
      },
      getSystemModelConfigUpdate(modelData),
      { session }
    );
    if (result.matchedCount !== 1) throw ModelErrEnum.unExist;
  });
  await updatedReloadSystemModel();
};

/** 在单个 MongoDB 事务中批量更新系统或团队模型启停状态，并刷新运行时模型快照。 */
export const updateSystemModelStatus = async ({
  modelIds,
  isActive,
  scope = ModelScopeEnum.system,
  tmbId
}: {
  modelIds: string[];
  isActive: boolean;
  scope?: ModelScopeEnum;
  tmbId?: string;
}) => {
  await runSystemModelTransaction((session) =>
    updateExistingSystemModels({ modelIds, update: { isActive }, session, scope, tmbId })
  );
  await updatedReloadSystemModel();
};

/** 更新系统或团队模型配置，在事务内原子检查实例可用性、类型与重名。 */
export const updateModel = async ({
  modelId,
  modelData,
  channelType = 'system',
  tmbId
}: UpdateModelBody & { tmbId?: string }): Promise<void> => {
  const isTeam = channelType === 'team' || modelData.scope === ModelScopeEnum.team;
  const resolvedScope = isTeam ? ModelScopeEnum.team : ModelScopeEnum.system;

  if (isTeam) {
    delete (modelData as Record<string, unknown>).requestUrl;
    delete (modelData as Record<string, unknown>).requestAuth;
    delete (modelData as Record<string, unknown>).testMode;
  }

  await updateSystemModelConfig({
    modelId,
    modelData,
    scope: resolvedScope,
    tmbId: isTeam && tmbId ? tmbId : undefined
  });
};

/** 预检重名后事务创建模型；数据库唯一索引负责并发兜底。 */
export const createModel = async ({
  modelData,
  channelType
}: CreateModelBody): Promise<CreateModelResponse> => {
  const isTeam = channelType === 'team' || modelData.scope === ModelScopeEnum.team;
  const resolvedScope = isTeam ? ModelScopeEnum.team : ModelScopeEnum.system;

  if (isTeam) {
    delete (modelData as Record<string, unknown>).requestUrl;
    delete (modelData as Record<string, unknown>).requestAuth;
    delete (modelData as Record<string, unknown>).testMode;
  }

  const duplicateFilter: Record<string, unknown> = {
    scope: resolvedScope,
    model: modelData.model
  };
  if (isTeam && modelData.tmbId) {
    duplicateFilter.tmbId = modelData.tmbId;
  }
  const existingModel = await MongoAIModel.exists(duplicateFilter);
  if (existingModel) {
    throw new UserError(ModelErrEnum.alreadyExists);
  }

  const [model] = await runSystemModelTransaction((session) =>
    MongoAIModel.create(
      [
        {
          ...modelData,
          scope: resolvedScope,
          isActive: modelData.isActive ?? false
        }
      ],
      { session }
    )
  );
  await updatedReloadSystemModel();

  return CreateModelResponseSchema.parse({ modelId: String(model._id) });
};

/** 提交时重新读取模板，预检后批量创建停用实例。 */
export const createModelsFromTemplates = async ({
  templates,
  channelType = 'system',
  tmbId,
  teamId
}: CreateModelsFromTemplatesBody & {
  tmbId?: string;
  teamId?: string;
}): Promise<CreateModelsFromTemplatesResponse> => {
  const latestTemplates = await refreshModelTemplates();
  const latestTemplateMap = new Map(
    latestTemplates.map((template) => [`${template.type}:${template.model}`, template])
  );
  const selectedTemplates = templates.map((reference) => {
    const key = `${reference.type}:${reference.model}`;
    const template = latestTemplateMap.get(key);
    if (!template) throw new UserError(`Model template no longer exists: ${key}`);
    return template;
  });

  const isTeam = channelType === 'team';
  const resolvedScope = isTeam ? ModelScopeEnum.team : ModelScopeEnum.system;
  const existingFilter: Record<string, unknown> = {
    scope: resolvedScope,
    model: { $in: selectedTemplates.map(({ model }) => model) }
  };
  if (isTeam && tmbId) {
    existingFilter.tmbId = tmbId;
  }

  const existingModels = await MongoAIModel.find(existingFilter).select({ model: 1 }).lean();
  const existingModelNames = new Set(existingModels.map((model) => model.model));
  const modelsToCreate = selectedTemplates
    .filter((template) => !existingModelNames.has(template.model))
    .map((template) => ({
      ...template,
      scope: resolvedScope,
      ...(isTeam && tmbId ? { tmbId } : {}),
      ...(isTeam && teamId ? { teamId } : {}),
      isActive: false
    }));

  const createdModels = await runSystemModelTransaction(async (session) => {
    if (modelsToCreate.length === 0) return [];
    return MongoAIModel.insertMany(modelsToCreate, { session });
  });

  await updatedReloadSystemModel();

  return CreateModelsFromTemplatesResponseSchema.parse({
    models: createdModels.map((model) => ({
      modelId: String(model._id),
      type: model.type,
      model: model.model
    }))
  });
};

/** 按稳定 ID 在同一事务删除模型、权限和探测历史并刷新缓存。 */
export const deleteModels = async ({
  modelIds,
  channelType = 'system',
  tmbId
}: DeleteModelsBody & { tmbId?: string }): Promise<void> => {
  const isTeam = channelType === 'team';
  const resolvedScope = isTeam ? ModelScopeEnum.team : ModelScopeEnum.system;

  const query: Record<string, unknown> = { _id: { $in: modelIds }, scope: resolvedScope };
  if (isTeam && tmbId) {
    query.tmbId = tmbId;
  }

  const models = await MongoAIModel.find(query).select({ model: 1 }).lean();
  if (models.length !== modelIds.length) throw ModelErrEnum.unExist;

  await runSystemModelTransaction(async (session) => {
    const result = await MongoAIModel.deleteMany(query, { session });
    if (result.deletedCount !== modelIds.length) return Promise.reject(ModelErrEnum.unExist);

    await MongoModelStatusProbeRecord.deleteMany({ modelId: { $in: modelIds } }, { session });

    await MongoResourcePermission.deleteMany(
      {
        resourceType: PerResourceTypeEnum.model,
        resourceId: { $in: modelIds }
      },
      { session }
    );
  });

  await updatedReloadSystemModel();
};

/** 校验默认模型引用并提交配置，不接受失效或类型不匹配的引用。 */
export const updateSystemDefaultModels = async (
  defaults: UpdateDefaultModelsBody
): Promise<void> => {
  await runSystemModelTransaction(async (session) => {
    const defaultFields = [
      {
        modelId: defaults[ModelTypeEnum.llm],
        expectedType: ModelTypeEnum.llm
      },
      {
        modelId: defaults[ModelTypeEnum.embedding],
        expectedType: ModelTypeEnum.embedding
      },
      {
        modelId: defaults[ModelTypeEnum.tts],
        expectedType: ModelTypeEnum.tts
      },
      {
        modelId: defaults[ModelTypeEnum.stt],
        expectedType: ModelTypeEnum.stt
      },
      {
        modelId: defaults[ModelTypeEnum.rerank],
        expectedType: ModelTypeEnum.rerank
      },
      {
        modelId: defaults.datasetTextLLMModelId,
        expectedType: ModelTypeEnum.llm
      },
      {
        modelId: defaults.datasetImageLLMModelId,
        expectedType: ModelTypeEnum.llm,
        requiresVision: true
      },
      {
        modelId: defaults.chatTitleLLMModelId,
        expectedType: ModelTypeEnum.llm
      }
    ].filter((item): item is typeof item & { modelId: string } => typeof item.modelId === 'string');

    if (defaultFields.length > 0) {
      const modelMap = new Map(
        (
          await MongoAIModel.find(
            { scope: ModelScopeEnum.system },
            '_id name model type isActive config.vision'
          )
            .session(session)
            .lean()
        ).map((model) => [String(model._id), model])
      );

      for (const { modelId, expectedType, requiresVision } of defaultFields) {
        assertModelAvailable({
          model: modelMap.get(modelId),
          type: expectedType,
          vision: requiresVision
        });
      }
    }

    const configuredDefaultModelIds = {
      [ModelTypeEnum.llm]: defaults[ModelTypeEnum.llm],
      [ModelTypeEnum.embedding]: defaults[ModelTypeEnum.embedding],
      [ModelTypeEnum.tts]: defaults[ModelTypeEnum.tts],
      [ModelTypeEnum.stt]: defaults[ModelTypeEnum.stt],
      [ModelTypeEnum.rerank]: defaults[ModelTypeEnum.rerank],
      datasetTextLLM: defaults.datasetTextLLMModelId,
      datasetImageLLM: defaults.datasetImageLLMModelId,
      chatTitleLLM: defaults.chatTitleLLMModelId
    };

    const { upsertSystemDefaultModelIds } = await import('../defaultModel/entity');
    await upsertSystemDefaultModelIds(configuredDefaultModelIds, session);
  });

  await updatedReloadSystemModel();
};
