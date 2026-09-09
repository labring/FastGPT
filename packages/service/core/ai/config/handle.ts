import { assertModelAvailable } from '../utils';
import { cloneDeep } from 'lodash-es';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType,
  ModelReferenceType,
  RerankSystemModelDataType,
  STTSystemModelDataType,
  SystemModelDataType,
  TTSSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/defaultModel';
import type { SystemDefaultModelType } from '../type';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';

type ModelSnapshot = {
  models: SystemModelDataType[];
  defaultModels: DefaultModelsBySlot;
  configuredDefaultModelIds: ModelDefaultIds;
  revision: number;
  version: string;
};
type OptionalResult<T, O extends boolean> = O extends true ? T | undefined : T;
type ModelLookupResult<T> = { model: T; error: undefined } | { model: undefined; error: UserError };
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
  const modelsByName = new Map(snapshot.models.map((model) => [model.model, model]));
  const activeModels = freeze(snapshot.models.filter((model) => model.isActive));
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
    <T extends SystemModelDataType>(type: T['type'], vision = false) =>
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

  const getVlmModelData = typedGetter<LLMSystemModelDataType>(ModelTypeEnum.llm, true);

  return Object.freeze({
    revision: snapshot.revision,
    version: snapshot.version,
    configuredDefaultModelIds: snapshot.configuredDefaultModelIds,
    getLLMModelData: typedGetter<LLMSystemModelDataType>(ModelTypeEnum.llm),
    getEmbeddingModelData: typedGetter<EmbeddingSystemModelDataType>(ModelTypeEnum.embedding),
    getRerankModelData: typedGetter<RerankSystemModelDataType>(ModelTypeEnum.rerank),
    getTTSModelData: typedGetter<TTSSystemModelDataType>(ModelTypeEnum.tts),
    getSTTModelData: typedGetter<STTSystemModelDataType>(ModelTypeEnum.stt),
    getVlmModelData,
    /** 仅将预期的模型不可用转为业务结果；复用严格 getter，程序异常仍交给外层处理。 */
    tryGetVlmModelData: (
      reference: ModelReferenceType
    ): ModelLookupResult<LLMSystemModelDataType> => {
      try {
        return { model: getVlmModelData(reference), error: undefined };
      } catch (error) {
        if (
          error instanceof UserError &&
          (error.message === ModelErrEnum.unExist || error.message === ModelErrEnum.unConfigured)
        ) {
          return { model: undefined, error };
        }
        throw error;
      }
    },
    /** 展示/编辑允许停用项；返回副本供草稿临时覆盖配置，不暴露共享对象。 */
    findModelData: <T extends `${ModelTypeEnum}` = `${ModelTypeEnum}`>(
      reference: ModelReferenceType,
      options?: { type?: T; vision?: boolean }
    ): Extract<SystemModelDataType, { type: T }> | undefined => {
      const model = resolve(reference);
      if (
        !model ||
        (options?.type && model.type !== options.type) ||
        (options?.vision && !(model.type === ModelTypeEnum.llm && model.config.vision))
      )
        return;
      return cloneDeep(model) as Extract<SystemModelDataType, { type: T }>;
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
    getActiveModels: () => activeModels
  });
};

export type ModelHandle = ReturnType<typeof createModelHandle>;

let cachedHandle: ModelHandle | undefined;

/** 缓存实现内部读取；业务只能通过异步 getModelHandle 获取。 */
export const getCachedModelHandle = () => cachedHandle;

/** 加载器在完整验证后原子发布；测试或独立运行环境可显式注入/清理快照。 */
export const publishModelHandle = (handle: ModelHandle | undefined) => {
  cachedHandle = handle;
};
