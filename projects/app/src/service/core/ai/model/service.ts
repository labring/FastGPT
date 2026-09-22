import { assertModelAvailable } from '@fastgpt/service/core/ai/utils';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { runSystemModelTransaction } from '@fastgpt/service/core/ai/config/entity';
import {
  refreshModelTemplates,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import {
  getSystemModelConfigUpdate,
  updateSystemModelConfig
} from '@fastgpt/service/core/ai/config/service';
import {
  appendModelsToAIProxyChannels,
  removeModelsFromAIProxyChannels,
  syncModelInAIProxyChannels
} from '@fastgpt/service/thirdProvider/aiproxy/channel';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { upsertSystemDefaultModelIds } from '@fastgpt/service/core/ai/defaultModel/entity';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  normalizeModelPricingForRead,
  normalizeModelPricingForSave
} from '@fastgpt/global/core/ai/pricing';
import {
  ImportedSystemModelSchema,
  CreateSystemModelResponseSchema,
  CreateSystemModelsFromTemplatesResponseSchema,
  type CreateSystemModelBody,
  type CreateSystemModelResponse,
  type CreateSystemModelsFromTemplatesBody,
  type CreateSystemModelsFromTemplatesResponse,
  type DeleteSystemModelsBody,
  type ParsedSystemModelsWithJsonBody,
  type UpdateDefaultModelsBody,
  type UpdateSystemModelBody
} from '@fastgpt/global/openapi/admin/system/model/api';

/** 配置和渠道由同一已校验请求提交；外部写入前检查目标实例、类型与新标识可用性。 */
export const updateSystemModel = async ({
  modelId,
  modelData,
  channelIds
}: UpdateSystemModelBody): Promise<void> => {
  const existing = await MongoAIModel.findOne({ _id: modelId, scope: ModelScopeEnum.system })
    .select({ model: 1, type: 1 })
    .lean();
  if (!existing) throw ModelErrEnum.unExist;
  if (existing.type !== modelData.type) {
    throw new UserError('System model type cannot be changed');
  }

  const oldModel = existing.model;
  const targetModel = modelData.model?.trim() || oldModel;
  const isModelRenamed = targetModel !== oldModel;

  if (isModelRenamed) {
    const existingTarget = await MongoAIModel.exists({
      scope: ModelScopeEnum.system,
      model: targetModel,
      _id: { $ne: modelId }
    });
    if (existingTarget) {
      throw new UserError(ModelErrEnum.alreadyExists);
    }
  }

  if (channelIds !== undefined || isModelRenamed) {
    await syncModelInAIProxyChannels({
      oldModel,
      newModel: targetModel,
      channelIds
    });
  }
  await updateSystemModelConfig({
    modelId,
    modelData: {
      ...modelData,
      model: targetModel
    }
  });
};

/** 预检重名后先绑定渠道，再事务创建模型；数据库唯一索引负责并发兜底。 */
export const createSystemModel = async ({
  modelData,
  channelIds
}: CreateSystemModelBody): Promise<CreateSystemModelResponse> => {
  // 可提前识别的重名必须在 AI Proxy 写入前拒绝；数据库唯一索引继续作为并发兜底。
  const existingModel = await MongoAIModel.exists({
    scope: ModelScopeEnum.system,
    model: modelData.model
  });
  if (existingModel) {
    throw new UserError(ModelErrEnum.alreadyExists);
  }

  await appendModelsToAIProxyChannels({ channelIds, models: [modelData.model] });

  const [model] = await runSystemModelTransaction((session) =>
    MongoAIModel.create(
      [
        {
          ...modelData,
          isActive: modelData.isActive ?? false
        }
      ],
      { session }
    )
  );
  await updatedReloadSystemModel();

  return CreateSystemModelResponseSchema.parse({ modelId: String(model._id) });
};

/** 提交时重新读取模板，预检后绑定渠道，再批量创建停用实例。 */
export const createSystemModelsFromTemplates = async ({
  templates,
  channelIds
}: CreateSystemModelsFromTemplatesBody): Promise<CreateSystemModelsFromTemplatesResponse> => {
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

  const existingModels = await MongoAIModel.find({
    scope: ModelScopeEnum.system,
    model: { $in: selectedTemplates.map(({ model }) => model) }
  })
    .select({ model: 1 })
    .lean();
  const existingModelNames = new Set(existingModels.map((model) => model.model));
  const modelsToCreate = selectedTemplates
    .filter((template) => !existingModelNames.has(template.model))
    .map((template) => ({ ...template, isActive: false }));

  await appendModelsToAIProxyChannels({
    channelIds,
    models: modelsToCreate.map((model) => model.model)
  });

  const createdModels = await runSystemModelTransaction(async (session) => {
    if (modelsToCreate.length === 0) return [];
    return MongoAIModel.insertMany(modelsToCreate, { session });
  });

  await updatedReloadSystemModel();

  return CreateSystemModelsFromTemplatesResponseSchema.parse({
    models: createdModels.map((model) => ({
      modelId: String(model._id),
      type: model.type,
      model: model.model
    }))
  });
};

/** 按稳定 ID 先事务删除模型与权限并刷新缓存，再解绑渠道；解绑失败不回退删除。 */
export const deleteSystemModels = async ({ modelIds }: DeleteSystemModelsBody): Promise<void> => {
  const models = await MongoAIModel.find({ _id: { $in: modelIds }, scope: ModelScopeEnum.system })
    .select({ model: 1 })
    .lean();
  if (models.length !== modelIds.length) throw ModelErrEnum.unExist;

  await runSystemModelTransaction(async (session) => {
    const result = await MongoAIModel.deleteMany(
      { _id: { $in: modelIds }, scope: ModelScopeEnum.system },
      { session }
    );
    if (result.deletedCount !== modelIds.length) return Promise.reject(ModelErrEnum.unExist);

    await MongoResourcePermission.deleteMany(
      {
        resourceType: PerResourceTypeEnum.model,
        resourceId: { $in: modelIds }
      },
      { session }
    );
  });

  await updatedReloadSystemModel();

  // 模型删除已经提交；渠道解绑失败向调用方报错，但不恢复模型、权限和缓存。
  await removeModelsFromAIProxyChannels({ models: models.map((model) => model.model) });
};

/** 替换系统模型配置，保留命中实例身份；事务删除缺失模型及权限，不修改 AI Proxy 渠道关联。 */
export const importSystemModels = async ({
  config
}: ParsedSystemModelsWithJsonBody): Promise<void> => {
  const latestRecords = config.flatMap((record) => {
    const modelId = record.modelId;
    return typeof modelId === 'string' && modelId.trim().length > 0
      ? [{ record, modelId: modelId.trim() }]
      : [];
  });
  // 非空旧配置全部缺少 modelId 时按“过滤旧数据”处理，不能意外删除全部现有模型。
  if (config.length > 0 && latestRecords.length === 0) return;

  const assertNoDuplicateIds = (models: Array<{ modelId: string }>) => {
    const modelIds = new Set<string>();
    for (const model of models) {
      if (modelIds.has(model.modelId)) throw new UserError(`Duplicate modelId: ${model.modelId}`);
      modelIds.add(model.modelId);
    }
  };
  assertNoDuplicateIds(latestRecords);

  await runSystemModelTransaction(async (session) => {
    const existingModels = await MongoAIModel.find(
      { scope: ModelScopeEnum.system },
      '_id model type'
    )
      .session(session)
      .lean();
    const existingModelMap = new Map(
      existingModels.map((model) => [
        String(model._id),
        { modelId: String(model._id), model: model.model, type: model.type }
      ])
    );
    const existingModelNameMap = new Map(
      existingModels.map((model) => [
        model.model,
        { modelId: String(model._id), model: model.model, type: model.type }
      ])
    );
    const resolvedLocalModelIds = new Set<string>();

    const importedModels = latestRecords.map(({ record, modelId }, index) => {
      const existingByModelId = existingModelMap.get(modelId);
      const existingByModelName =
        typeof record.model === 'string' ? existingModelNameMap.get(record.model) : undefined;
      const existingModel = existingByModelId ?? existingByModelName;

      if (existingModel) {
        if (resolvedLocalModelIds.has(existingModel.modelId)) {
          throw new UserError(
            `Conflicting import: multiple records map to local model ${existingModel.modelId}`
          );
        }
        resolvedLocalModelIds.add(existingModel.modelId);
      }

      // 本地已有模型的类型不可变更；本地 ID 命中时允许使用导入的 model，外部 model 命中时沿用本地 model 与 type
      const parsed = ImportedSystemModelSchema.safeParse(
        existingModel
          ? {
              ...record,
              modelId,
              model:
                existingByModelId &&
                typeof record.model === 'string' &&
                record.model.trim().length > 0
                  ? record.model.trim()
                  : existingModel.model,
              type: existingModel.type
            }
          : { ...record, modelId }
      );
      if (!parsed.success) {
        throw new UserError(`Invalid system model at index ${index}: ${parsed.error.message}`);
      }
      return { data: parsed.data, existingModel };
    });

    const resolvedModels = importedModels.map(
      ({ data: { modelId: importedModelId, ...importedData }, existingModel }) => {
        // JSON 和编辑器共用“读取时转换 -> 保存新格式”；导出本身不改写历史价格。
        const modelData = normalizeModelPricingForSave(normalizeModelPricingForRead(importedData));
        if (!existingModel) {
          return {
            modelId: importedModelId,
            model: modelData.model,
            modelData,
            isExistingModel: false
          };
        }

        // 本实例已存在的模型按持久化 ID 更新，model 允许更新，type 不参与写入。
        const targetModel = modelData.model || existingModel.model;
        return {
          modelId: existingModel.modelId,
          model: targetModel,
          modelData: {
            ...modelData,
            model: targetModel
          },
          isExistingModel: true
        };
      }
    );

    const modelNames = new Set<string>();
    for (const model of resolvedModels) {
      if (modelNames.has(model.model)) throw new UserError(`Duplicate model: ${model.model}`);
      modelNames.add(model.model);

      const conflictingModel = existingModelNameMap.get(model.model);
      if (conflictingModel && conflictingModel.modelId !== model.modelId) {
        throw new UserError(`Model identifier already in use: ${model.model}`);
      }
    }

    const retainedModelIds = new Set(
      resolvedModels.filter((model) => model.isExistingModel).map((model) => model.modelId)
    );
    const removedModelIds = existingModels
      .filter(({ _id }) => !retainedModelIds.has(String(_id)))
      .map(({ _id }) => _id);
    if (removedModelIds.length > 0) {
      // 配置替换只删除本地模型和权限，保留渠道配置供后续重新导入使用。
      await MongoAIModel.deleteMany(
        { _id: { $in: removedModelIds }, scope: ModelScopeEnum.system },
        { session }
      );
      await MongoResourcePermission.deleteMany(
        {
          resourceType: PerResourceTypeEnum.model,
          resourceId: { $in: removedModelIds }
        },
        { session }
      );
    }

    if (importedModels.length === 0) return;
    await MongoAIModel.bulkWrite(
      resolvedModels.map(({ modelId, model, modelData, isExistingModel }) => ({
        updateOne: {
          filter: isExistingModel
            ? { _id: modelId, scope: ModelScopeEnum.system }
            : { scope: ModelScopeEnum.system, model },
          update: isExistingModel ? getSystemModelConfigUpdate(modelData) : { $set: modelData },
          upsert: !isExistingModel
        }
      })),
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
      // 全表读取后按 String(_id) 精确匹配，统一处理 API 层已校验的 ObjectId 字符串。
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
