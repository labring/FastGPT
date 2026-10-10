import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/model/default';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import type {
  AIModelDataType,
  EmbeddingModelDataType,
  LLMModelDataType,
  ModelReferenceType,
  RerankModelDataType,
  STTModelDataType,
  TTSModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { isSystemModel, isTeamModel } from '@fastgpt/global/core/ai/model/utils';
import { cloneDeep } from 'lodash-es';
import type { SystemDefaultModelType } from '../../type';
import { assertModelAvailable } from '../../utils';

type ModelSnapshot = {
  models: AIModelDataType[];
  defaultModels: DefaultModelsBySlot;
  configuredDefaultModelIds: ModelDefaultIds;
  revision: number;
  version: string;
};
type OptionalResult<T, O extends boolean> = O extends true ? T | undefined : T;
type DefaultModelsBySlot = {
  [S in keyof SystemDefaultModelType as `${S}`]: SystemDefaultModelType[S];
};
type DefaultSlot = keyof DefaultModelsBySlot;
type DefaultResult<S extends DefaultSlot> = S extends 'datasetImageLLM' | 'chatTitleLLM'
  ? DefaultModelsBySlot[S]
  : NonNullable<DefaultModelsBySlot[S]>;

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
  const defaultIds = freeze({
    llm: snapshot.defaultModels.llm?.modelId,
    embedding: snapshot.defaultModels.embedding?.modelId,
    rerank: snapshot.defaultModels.rerank?.modelId,
    tts: snapshot.defaultModels.tts?.modelId,
    stt: snapshot.defaultModels.stt?.modelId
  });

  /** modelId 一旦出现就禁止按旧名称回退；展示名不作为模型身份。 */
  const resolve = (reference: ModelReferenceType) => {
    if (!isEmptyModelValue(reference.modelId)) return modelsById.get(reference.modelId!);
    if (!isEmptyModelValue(reference.model)) return modelsByName.get(reference.model!);
  };
  const typedGetter =
    <T extends AIModelDataType>(type: T['type'], vision = false) =>
    <O extends boolean = false>(
      reference: ModelReferenceType,
      options?: { optional?: O }
    ): OptionalResult<T, O> => {
      if (isEmptyModelValue(getModelReferenceValue(reference))) {
        if (options?.optional) return undefined as OptionalResult<T, O>;
        throw new UserError(ModelErrEnum.unConfigured);
      }
      const model = resolve(reference);
      assertModelAvailable({ model, type, vision });
      return model as OptionalResult<T, O>;
    };

  const getVlmModelData = typedGetter<LLMModelDataType>(ModelTypeEnum.llm, true);

  return Object.freeze({
    revision: snapshot.revision,
    version: snapshot.version,
    configuredDefaultModelIds: snapshot.configuredDefaultModelIds,
    getLLMModelData: typedGetter<LLMModelDataType>(ModelTypeEnum.llm),
    getEmbeddingModelData: typedGetter<EmbeddingModelDataType>(ModelTypeEnum.embedding),
    getRerankModelData: typedGetter<RerankModelDataType>(ModelTypeEnum.rerank),
    getTTSModelData: typedGetter<TTSModelDataType>(ModelTypeEnum.tts),
    getSTTModelData: typedGetter<STTModelDataType>(ModelTypeEnum.stt),
    getVlmModelData,
    /** 展示/编辑允许停用项；返回副本供草稿临时覆盖配置，不暴露共享对象。 */
    findModelData: <T extends `${ModelTypeEnum}` = `${ModelTypeEnum}`>(
      reference: ModelReferenceType,
      options?: { type?: T; vision?: boolean }
    ): Extract<AIModelDataType, { type: T }> | undefined => {
      const model = resolve(reference);
      if (
        !model ||
        (options?.type && model.type !== options.type) ||
        (options?.vision && !(model.type === ModelTypeEnum.llm && model.config.vision))
      )
        return;
      return cloneDeep(model) as Extract<AIModelDataType, { type: T }>;
    },
    /** 保留原缺省约定：图片与标题可缺省，其余默认槽位缺失时明确报错。 */
    getDefaultModelData: <S extends DefaultSlot>(slot: S): DefaultResult<S> => {
      const model = snapshot.defaultModels[slot];
      if (slot === 'datasetImageLLM' || slot === 'chatTitleLLM') {
        if (!model?.isActive) return undefined as DefaultResult<S>;
      }
      if (!model) throw new UserError(ModelErrEnum.unConfigured);
      const expectedType = ['datasetTextLLM', 'datasetImageLLM', 'chatTitleLLM'].includes(slot)
        ? ModelTypeEnum.llm
        : (slot as ModelTypeEnum);
      assertModelAvailable({ model, type: expectedType, vision: slot === 'datasetImageLLM' });
      return model as DefaultResult<S>;
    },
    getSystemDefaultModelIds: () => defaultIds,
    getAllModels: () => snapshot.models,
    getActiveModels: () => activeModels,
    getSystemModels: () => systemModels,
    getTeamModels: (tmbId?: string) =>
      tmbId ? teamModels.filter((model) => model.tmbId === tmbId) : teamModels,
    defaultModels: snapshot.defaultModels
  });
};

export type ModelHandle = ReturnType<typeof createModelHandle>;
