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
import { invalidateTeamModelCache } from './teamModelCache';
import { clearMyModelsCache } from '../../../support/permission/model/cache';
import { upsertSystemDefaultModelIds } from '../defaultModel/entity';
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
import { channelTypeToScope, resolveChannelType } from '@fastgpt/global/core/ai/model';
import {
  getSystemModelConfigUpdate,
  sanitizeTeamModelData,
  type EditableSystemModelData
} from './utils';
import type { ChannelType } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

/**
 * 更新一组已存在的系统模型，并保证目标集合完整命中。
 *
 * 该内部入口集中 system scope 和“不允许部分命中”的业务规则；是否开启事务由上层操作决定。
 */
const updateExistingModels = async ({
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

/** 按稳定 modelId 更新单个系统或团队模型的可编辑配置，并刷新运行时模型快照或团队缓存。 */
export const updateModelConfig = async ({
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
  let existingTeamId: string | undefined;

  await runSystemModelTransaction(async (session) => {
    const isTeam = scope === ModelScopeEnum.team;
    if (isTeam && !tmbId) throw ModelErrEnum.unExist;
    const query: Record<string, any> = { _id: modelId, scope };
    if (isTeam) {
      query.tmbId = tmbId;
    }
    const projection: Record<string, number> = { type: 1, model: 1 };
    if (isTeam) {
      projection.tmbId = 1;
      projection.teamId = 1;
    }
    const existingModel = await MongoAIModel.findOne(query, projection).session(session).lean();
    if (!existingModel) throw ModelErrEnum.unExist;
    if (existingModel.type !== modelData.type) {
      throw new UserError('System model type cannot be changed');
    }
    if (existingModel.teamId) {
      existingTeamId = String(existingModel.teamId);
    }

    const trimmedModel = typeof modelData.model === 'string' ? modelData.model.trim() : undefined;
    if (trimmedModel && trimmedModel !== existingModel.model) {
      const duplicateQuery: Record<string, any> = {
        scope,
        model: trimmedModel,
        _id: { $ne: modelId }
      };
      if (isTeam && existingModel.tmbId) {
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

  if (scope === ModelScopeEnum.team) {
    invalidateTeamModelCache({ teamId: existingTeamId, tmbId, modelId });
    if (existingTeamId) {
      await clearMyModelsCache({ teamId: existingTeamId });
    }
  } else {
    await updatedReloadSystemModel();
  }
};

/** 在单个 MongoDB 事务中批量更新系统或团队模型启停状态，并刷新运行时模型快照或团队缓存。 */
export const updateModelStatus = async ({
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
  let teamIds: string[] = [];
  if (scope === ModelScopeEnum.team) {
    if (!tmbId) return Promise.reject(ModelErrEnum.unExist);
    const existingModels = await MongoAIModel.find({
      _id: { $in: modelIds },
      scope,
      tmbId
    })
      .select({ teamId: 1 })
      .lean();
    if (existingModels.length !== modelIds.length) {
      return Promise.reject(ModelErrEnum.unExist);
    }
    teamIds = Array.from(
      new Set(
        existingModels
          .map((m) => (m.teamId ? String(m.teamId) : undefined))
          .filter((id): id is string => !!id)
      )
    );
  }

  await runSystemModelTransaction((session) =>
    updateExistingModels({ modelIds, update: { isActive }, session, scope, tmbId })
  );

  if (scope === ModelScopeEnum.team) {
    for (const teamId of teamIds) {
      invalidateTeamModelCache({ teamId, tmbId });
      await clearMyModelsCache({ teamId });
    }
    modelIds.forEach((modelId) => invalidateTeamModelCache({ modelId, tmbId }));
  } else {
    await updatedReloadSystemModel();
  }
};

/** 更新系统或团队模型配置，在事务内原子检查实例可用性、类型与重名。 */
export const updateModel = async ({
  modelId,
  modelData,
  channelType,
  tmbId,
  syncModelName = async () => {}
}: UpdateModelBody & {
  tmbId?: string;
  syncModelName?: (props: {
    oldModel: string;
    newModel: string;
    channelType: ChannelType;
    tmbId: string;
  }) => Promise<void>;
}): Promise<void> => {
  const resolvedType = resolveChannelType({ channelType, scope: modelData.scope });
  const isTeam = resolvedType === 'team';
  if (isTeam && !tmbId) return Promise.reject(ModelErrEnum.unExist);

  const existingModel = await MongoAIModel.findOne({
    _id: modelId,
    scope: channelTypeToScope(resolvedType),
    ...(isTeam ? { tmbId } : {})
  })
    .select({ model: 1, type: 1, tmbId: 1, teamId: 1 })
    .lean();
  if (!existingModel) return Promise.reject(ModelErrEnum.unExist);
  if (existingModel.type !== modelData.type) {
    throw new UserError('System model type cannot be changed');
  }

  const targetModel = modelData.model?.trim() ?? existingModel.model;
  const isModelRenamed = targetModel !== existingModel.model;

  if (isModelRenamed) {
    const conflict = await MongoAIModel.exists({
      _id: { $ne: modelId },
      scope: channelTypeToScope(resolvedType),
      model: targetModel,
      ...(isTeam ? { tmbId } : {})
    });
    if (conflict) {
      throw new UserError(ModelErrEnum.alreadyExists);
    }
  }

  await updateModelConfig({
    modelId,
    modelData: isTeam ? sanitizeTeamModelData(modelData) : modelData,
    scope: channelTypeToScope(resolvedType),
    tmbId: isTeam && tmbId ? tmbId : undefined
  });

  if (isModelRenamed && syncModelName) {
    try {
      await syncModelName({
        oldModel: existingModel.model,
        newModel: targetModel,
        channelType: resolvedType,
        tmbId: tmbId ?? ''
      });
    } catch (error) {
      await runSystemModelTransaction(async (session) => {
        await MongoAIModel.updateOne(
          { _id: modelId },
          { $set: { model: existingModel.model } },
          { session }
        );
      }).catch((rollbackError) => {
        logger.error('Rollback Mongo model rename failed', {
          modelId,
          oldModel: existingModel.model,
          rollbackError
        });
      });
      if (isTeam) {
        const teamIdStr = existingModel.teamId ? String(existingModel.teamId) : undefined;
        invalidateTeamModelCache({ teamId: teamIdStr, tmbId, modelId });
        if (teamIdStr) {
          await clearMyModelsCache({ teamId: teamIdStr });
        }
      } else {
        await updatedReloadSystemModel();
      }
      throw error;
    }
  }
};

/**
 * 预检重名后事务创建模型；数据库唯一索引负责并发兜底。
 * 模型归属（scope/tmbId/teamId）统一在此注入，调用方只需传入当前会话身份，
 * 不允许由请求体决定归属；team 模型会剔除仅系统模型可用的直连配置。
 */
export const createModel = async ({
  modelData,
  channelType,
  tmbId,
  teamId
}: Pick<CreateModelBody, 'modelData' | 'channelType'> & {
  tmbId?: string;
  teamId?: string;
}): Promise<CreateModelResponse> => {
  const resolvedType = resolveChannelType({ channelType, scope: modelData.scope });
  const isTeam = resolvedType === 'team';
  if (isTeam && (!tmbId || !teamId)) {
    return Promise.reject(ModelErrEnum.unExist);
  }
  const resolvedScope = channelTypeToScope(resolvedType);
  const ownerTmbId = isTeam ? tmbId : undefined;
  // 归属字段只信任会话身份，忽略请求体中携带的 tmbId/teamId
  const { tmbId: _ignoredTmbId, teamId: _ignoredTeamId, ...ownerlessModelData } = modelData;

  const duplicateFilter: Record<string, unknown> = {
    scope: resolvedScope,
    model: modelData.model
  };
  if (ownerTmbId) duplicateFilter.tmbId = ownerTmbId;
  const existingModel = await MongoAIModel.exists(duplicateFilter);
  if (existingModel) {
    throw new UserError(ModelErrEnum.alreadyExists);
  }

  const [model] = await runSystemModelTransaction((session) =>
    MongoAIModel.create(
      [
        {
          ...(isTeam ? sanitizeTeamModelData(ownerlessModelData) : ownerlessModelData),
          scope: resolvedScope,
          ...(ownerTmbId ? { tmbId: ownerTmbId } : {}),
          ...(isTeam && teamId ? { teamId } : {}),
          isActive: modelData.isActive ?? false
        }
      ],
      { session }
    )
  );
  if (isTeam) {
    invalidateTeamModelCache({ teamId, tmbId: ownerTmbId, modelId: String(model._id) });
    if (teamId) {
      await clearMyModelsCache({ teamId });
    }
  } else {
    await updatedReloadSystemModel();
  }

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
  if (isTeam && (!tmbId || !teamId)) {
    return Promise.reject(ModelErrEnum.unExist);
  }
  const resolvedScope = channelTypeToScope(channelType);
  const existingFilter: Record<string, unknown> = {
    scope: resolvedScope,
    model: { $in: selectedTemplates.map(({ model }) => model) }
  };
  if (isTeam) {
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

  if (isTeam) {
    invalidateTeamModelCache({ teamId, tmbId });
    if (teamId) {
      await clearMyModelsCache({ teamId });
    }
  } else {
    await updatedReloadSystemModel();
  }

  return CreateModelsFromTemplatesResponseSchema.parse({
    models: createdModels.map((model) => ({
      modelId: String(model._id),
      type: model.type,
      model: model.model
    }))
  });
};

/**
 * 按稳定 ID 在同一事务删除模型、权限和探测历史并刷新缓存。
 * 返回被删除模型的上游模型名，供调用方清理 AI Proxy 渠道中的残留映射（属于 AI Proxy 侧副作用，不进事务）。
 */
export const deleteModels = async ({
  modelIds,
  channelType = 'system',
  tmbId
}: DeleteModelsBody & { tmbId?: string }): Promise<string[]> => {
  const isTeam = channelType === 'team';
  if (isTeam && !tmbId) return Promise.reject(ModelErrEnum.unExist);
  const resolvedScope = channelTypeToScope(channelType);

  const query: Record<string, unknown> = {
    _id: { $in: modelIds },
    scope: resolvedScope,
    ...(isTeam ? { tmbId } : {})
  };

  const models = await MongoAIModel.find(query).select({ model: 1, teamId: 1 }).lean();
  if (models.length !== modelIds.length) throw ModelErrEnum.unExist;
  const teamIds = isTeam
    ? Array.from(
        new Set(
          models
            .map((m) => (m.teamId ? String(m.teamId) : undefined))
            .filter((id): id is string => !!id)
        )
      )
    : [];

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

  if (isTeam) {
    for (const tId of teamIds) {
      invalidateTeamModelCache({ teamId: tId, tmbId });
      await clearMyModelsCache({ teamId: tId });
    }
    modelIds.forEach((mId) => invalidateTeamModelCache({ modelId: mId, tmbId }));
  } else {
    await updatedReloadSystemModel();
  }

  return models.map((item) => item.model);
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

    await upsertSystemDefaultModelIds(configuredDefaultModelIds, session);
  });

  await updatedReloadSystemModel();
};
