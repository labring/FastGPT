import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { isModelConfigError } from '@fastgpt/global/common/error/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/model/default';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import type { AIModelDataType, ModelReferenceType } from '@fastgpt/global/core/ai/model/schema';
import { isSystemModel, isTeamModel } from '@fastgpt/global/core/ai/model/utils';
import { cloneDeep } from 'lodash-es';
import type { SystemDefaultModelType } from '../../type';
import { assertModelAvailable } from '../../utils';

type ModelSnapshot = {
  models: AIModelDataType[];
  defaultModels?: DefaultModelsBySlot;
  configuredDefaultModelIds: DefaultIdsBySlot;
  revision: number;
  version: string;
};
type OptionalResult<T, O extends boolean> = O extends true ? T | undefined : T;
type ModelByType = {
  [K in ModelTypeEnum as `${K}`]: Extract<AIModelDataType, { type: K }>;
};
type DefaultModelsBySlot = {
  [S in keyof SystemDefaultModelType as `${S}`]: SystemDefaultModelType[S];
};
type DefaultSlot = keyof DefaultModelsBySlot;
type DefaultIdsBySlot = Partial<Record<DefaultSlot, string>>;
type DefaultResult<S extends DefaultSlot> = S extends 'datasetImageLLM' | 'chatTitleLLM'
  ? DefaultModelsBySlot[S]
  : NonNullable<DefaultModelsBySlot[S]>;

const defaultSlots = [
  ModelTypeEnum.llm,
  ModelTypeEnum.embedding,
  ModelTypeEnum.tts,
  ModelTypeEnum.stt,
  ModelTypeEnum.rerank,
  'datasetTextLLM',
  'datasetImageLLM',
  'chatTitleLLM'
] as const satisfies readonly DefaultSlot[];

/**
 * 按候选系统模型集合计算有效默认模型 ID。
 * 管理员配置的默认模型不可用（或不在候选集合内）时，必填槽位在同类型启用系统模型内回退；
 * 回退遵循运行时目录顺序，与管理列表的展示 rank 无关，有效的显式默认值优先。
 * 图片知识库与对话标题属于可选增强能力，只校验已配置模型，不做隐式回退。
 */
export const resolveDefaultModelIds = ({
  models,
  configuredDefaults
}: {
  models: readonly AIModelDataType[];
  configuredDefaults: ModelDefaultIds;
}): DefaultIdsBySlot => {
  const candidates = models.filter((model) => model.isActive && isSystemModel(model));
  const modelMap = new Map(candidates.map((model) => [model.modelId, model]));
  const resolve = ({
    configuredId,
    type,
    predicate
  }: {
    configuredId?: string;
    type: ModelTypeEnum;
    predicate?: (model: AIModelDataType) => boolean;
  }) => {
    const isCandidate = (model?: AIModelDataType) =>
      !!model && model.type === type && (!predicate || predicate(model));
    const configuredModel = configuredId ? modelMap.get(configuredId) : undefined;
    return isCandidate(configuredModel)
      ? configuredModel?.modelId
      : candidates.find((model) => isCandidate(model))?.modelId;
  };

  const configuredChatTitle = configuredDefaults.chatTitleLLM
    ? modelMap.get(configuredDefaults.chatTitleLLM)
    : undefined;
  const configuredDatasetImage = configuredDefaults.datasetImageLLM
    ? modelMap.get(configuredDefaults.datasetImageLLM)
    : undefined;

  const llm = resolve({ configuredId: configuredDefaults.llm, type: ModelTypeEnum.llm });
  return {
    [ModelTypeEnum.llm]: llm,
    [ModelTypeEnum.embedding]: resolve({
      configuredId: configuredDefaults.embedding,
      type: ModelTypeEnum.embedding
    }),
    [ModelTypeEnum.tts]: resolve({
      configuredId: configuredDefaults.tts,
      type: ModelTypeEnum.tts
    }),
    [ModelTypeEnum.stt]: resolve({
      configuredId: configuredDefaults.stt,
      type: ModelTypeEnum.stt
    }),
    [ModelTypeEnum.rerank]: resolve({
      configuredId: configuredDefaults.rerank,
      type: ModelTypeEnum.rerank
    }),
    datasetTextLLM: resolve({
      configuredId:
        modelMap.get(configuredDefaults.datasetTextLLM ?? '')?.type === ModelTypeEnum.llm
          ? configuredDefaults.datasetTextLLM
          : llm,
      type: ModelTypeEnum.llm
    }),
    datasetImageLLM:
      configuredDatasetImage?.type === ModelTypeEnum.llm && configuredDatasetImage.config.vision
        ? configuredDatasetImage.modelId
        : undefined,
    chatTitleLLM:
      configuredChatTitle?.type === ModelTypeEnum.llm ? configuredChatTitle.modelId : undefined
  };
};

/**
 * 仅在发布目录时构造 handle。复制并冻结整个快照，方法闭包不再访问全局状态；
 * 更新缓存指针不会改变已发出 handle 的模型、默认值或版本。Map 留在闭包内，不能被调用方修改。
 */
export const createModelHandle = (input: ModelSnapshot) => {
  // 快照只包含已校验的 JSON 配置。递归冻结防止请求临时配置污染其他消费者。
  const freeze = <T>(value: T): T => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const snapshot = freeze(cloneDeep(input));
  const modelsById = new Map(snapshot.models.map((model) => [model.modelId, model]));
  const modelsByName = new Map(
    snapshot.models.filter(isSystemModel).map((model) => [model.model, model])
  );
  const activeModels = freeze(snapshot.models.filter((model) => model.isActive));
  const systemModels = freeze(snapshot.models.filter((model) => isSystemModel(model)));
  const teamModels = freeze(snapshot.models.filter((model) => isTeamModel(model)));
  const effectiveConfiguredDefaults = freeze<DefaultIdsBySlot>(
    Object.fromEntries(
      defaultSlots.map((slot) => [
        slot,
        snapshot.configuredDefaultModelIds[slot] ?? snapshot.defaultModels?.[slot]?.modelId
      ])
    )
  );
  const resolvedDefaultIds = resolveDefaultModelIds({
    models: systemModels,
    configuredDefaults: effectiveConfiguredDefaults
  });
  const defaultModels = freeze<DefaultModelsBySlot>(
    Object.fromEntries(
      defaultSlots.map((slot) => [
        slot,
        snapshot.defaultModels
          ? snapshot.defaultModels[slot]
          : resolvedDefaultIds[slot]
            ? modelsById.get(resolvedDefaultIds[slot]!)
            : undefined
      ])
    ) as DefaultModelsBySlot
  );
  const defaultIds = freeze<DefaultIdsBySlot>(
    Object.fromEntries(defaultSlots.map((slot) => [slot, defaultModels[slot]?.modelId]))
  );

  /** modelId 一旦出现就禁止按旧名称回退；展示名不作为模型身份。 */
  const resolve = (reference: ModelReferenceType) => {
    if (!isEmptyModelValue(reference.modelId)) return modelsById.get(reference.modelId!);
    if (!isEmptyModelValue(reference.model)) return modelsByName.get(reference.model!);
  };

  /**
   * 获取各槽位有效默认模型 ID。
   * - 未传 `authorizedIds`：返回系统快照默认 ID；
   * - 传入 `authorizedIds`：仅在当前成员有权限的系统模型（不含团队模型）内按 `系统默认模型 -> 系统可用模型` 回退。
   */
  const getDefaultModelIds = (authorizedIds?: ReadonlySet<string>): DefaultIdsBySlot => {
    if (!authorizedIds) return defaultIds;
    return resolveDefaultModelIds({
      models: systemModels.filter((model) => authorizedIds.has(model.modelId)),
      configuredDefaults: effectiveConfiguredDefaults
    });
  };

  /**
   * 获取指定槽位的默认模型数据。
   * - 未传 `authorizedIds`：校验并返回系统默认槽位（图片与标题可缺省）；
   * - 传入 `authorizedIds`：按 `系统默认模型 -> 系统可用模型` 回退（严格限定系统模型，不含团队模型），
   *   可选槽位（`datasetImageLLM` / `chatTitleLLM`）不回退并返回 `undefined`。
   */
  const getDefaultModelData = <S extends DefaultSlot, O extends boolean = false>(
    slot: S,
    options?: { authorizedIds?: ReadonlySet<string>; optional?: O }
  ): OptionalResult<DefaultResult<S>, O> => {
    type Result = OptionalResult<DefaultResult<S>, O>;
    const expectedType = ['datasetTextLLM', 'datasetImageLLM', 'chatTitleLLM'].includes(slot)
      ? ModelTypeEnum.llm
      : (slot as ModelTypeEnum);
    const needVision = slot === 'datasetImageLLM';
    const isOptionalSlot =
      slot === 'datasetImageLLM' || slot === 'chatTitleLLM' || Boolean(options?.optional);
    const configuredId = effectiveConfiguredDefaults[slot];
    const rawConfigured =
      defaultModels[slot] ?? (configuredId ? modelsById.get(configuredId) : undefined);

    const isConfiguredValid =
      !!rawConfigured?.isActive &&
      isSystemModel(rawConfigured) &&
      rawConfigured.type === expectedType &&
      (!needVision || (rawConfigured.type === ModelTypeEnum.llm && !!rawConfigured.config.vision));

    if (!options?.authorizedIds) {
      if (!isConfiguredValid && isOptionalSlot) return undefined as Result;
      if (!rawConfigured) throw new UserError(ModelErrEnum.unConfigured);
      assertModelAvailable({ model: rawConfigured, type: expectedType, vision: needVision });
      return rawConfigured as Result;
    }

    if (isConfiguredValid && options.authorizedIds.has(rawConfigured.modelId)) {
      return rawConfigured as Result;
    }
    if (
      !isConfiguredValid &&
      !snapshot.configuredDefaultModelIds[slot] &&
      !resolvedDefaultIds[slot]
    ) {
      if (isOptionalSlot) return undefined as Result;
      if (rawConfigured) {
        assertModelAvailable({ model: rawConfigured, type: expectedType, vision: needVision });
      }
    }

    const modelId = getDefaultModelIds(options.authorizedIds)[slot];
    const model = modelId ? modelsById.get(modelId) : undefined;
    if (model) return model as Result;
    if (isOptionalSlot) return undefined as Result;
    if (isConfiguredValid || resolvedDefaultIds[slot]) {
      throw new UserError(ModelErrEnum.unAuthModel);
    }
    if (rawConfigured) {
      assertModelAvailable({ model: rawConfigured, type: expectedType, vision: needVision });
    }
    throw new UserError(ModelErrEnum.unConfigured);
  };

  /**
   * 统一模型获取入口：解析引用、校验启用状态/类型/视觉能力与可选使用权限，并支持按槽位回退默认模型。
   * - `optional: true`：空引用返回 `undefined`，但显式传入的无效/无权限模型仍报错；
   * - `fallbackToDefault: true`：空引用或 `ModelConfigError` 回退到默认模型（无可用默认时返回 `undefined`），显式模型权限错误直接抛出；
   * - `authorizedIds`：传入时校验解析出的模型是否在集合内，不在则抛 `ModelErrEnum.unAuthModel`。
   */
  const getModelData = <
    T extends `${ModelTypeEnum}` = `${ModelTypeEnum}`,
    O extends boolean = false,
    F extends boolean = false
  >(
    reference: ModelReferenceType,
    options?: {
      type?: T;
      vision?: boolean;
      optional?: O;
      fallbackToDefault?: F;
      authorizedIds?: ReadonlySet<string>;
    }
  ): OptionalResult<ModelByType[T], O extends true ? true : F> => {
    type Result = OptionalResult<ModelByType[T], O extends true ? true : F>;
    const resolveAndValidate = () => {
      if (isEmptyModelValue(getModelReferenceValue(reference))) {
        if (options?.optional && !options?.fallbackToDefault) {
          return undefined;
        }
        throw new UserError(ModelErrEnum.unConfigured);
      }
      const model = resolve(reference);
      assertModelAvailable({ model, type: options?.type, vision: options?.vision });
      if (options?.authorizedIds && !options.authorizedIds.has(model!.modelId)) {
        throw new UserError(ModelErrEnum.unAuthModel);
      }
      return model as ModelByType[T];
    };

    if (!options?.fallbackToDefault) {
      return resolveAndValidate() as Result;
    }

    try {
      return resolveAndValidate() as Result;
    } catch (error) {
      if (!isModelConfigError(error) || !options.type) {
        throw error;
      }
      return getDefaultModelData(options.type, {
        authorizedIds: options.authorizedIds,
        optional: true
      }) as Result;
    }
  };

  return Object.freeze({
    revision: snapshot.revision,
    version: snapshot.version,
    configuredDefaultModelIds: snapshot.configuredDefaultModelIds,
    getModelData,
    /** 展示/编辑允许停用项；返回副本供草稿临时覆盖配置，不暴露共享对象。 */
    findModelData: <T extends `${ModelTypeEnum}` = `${ModelTypeEnum}`>(
      reference: ModelReferenceType,
      options?: { type?: T; vision?: boolean }
    ): ModelByType[T] | undefined => {
      const model = resolve(reference);
      if (
        !model ||
        (options?.type && model.type !== options.type) ||
        (options?.vision && !(model.type === ModelTypeEnum.llm && model.config.vision))
      )
        return;
      return cloneDeep(model) as ModelByType[T];
    },
    getDefaultModelData,
    getDefaultModelIds,
    getAllModels: () => snapshot.models,
    getActiveModels: () => activeModels,
    getSystemModels: () => systemModels,
    getTeamModels: (tmbId?: string) =>
      tmbId ? teamModels.filter((model) => model.tmbId === tmbId) : teamModels,
    defaultModels
  });
};

export type ModelHandle = ReturnType<typeof createModelHandle>;
