import { useUserStore } from '@/web/support/user/useUserStore';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/model/default';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import { isSystemModel } from '@fastgpt/global/core/ai/model/utils';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useUserModelStore } from './useUserModelStore';

export type ModelReadOptions = { outLinkAuthData?: OutLinkChatAuthProps };
export type ModelFilter<T extends ModelTypeEnum = ModelTypeEnum> = ModelReadOptions & {
  modelType?: T;
  vision?: boolean;
  excludeHidden?: boolean;
};
export type ModelOfType<T extends ModelTypeEnum> = Extract<MyModelItemType, { type: T }>;

/** 身份包含登录代次及外链凭证；无身份不请求，凭证变化后不能复用旧授权数据。 */
export const getModelReadIdentity = ({ outLinkAuthData }: ModelReadOptions = {}) => {
  const generation = useUserModelStore.getState().loginGeneration;
  if (outLinkAuthData) {
    if (!outLinkAuthData.shareId || !outLinkAuthData.outLinkUid) return;
    return {
      identity: `outlink:${outLinkAuthData.shareId}`,
      key: JSON.stringify([
        'outlink',
        outLinkAuthData.shareId,
        outLinkAuthData.outLinkUid,
        generation
      ]),
      load: { outLinkAuthData }
    };
  }
  const team = useUserStore.getState().userInfo?.team;
  if (!team?.teamId || !team.tmbId) return;
  return {
    identity: `${team.teamId}:${team.tmbId}`,
    key: JSON.stringify([team.teamId, team.tmbId, generation]),
    load: { teamId: team.teamId, tmbId: team.tmbId }
  };
};

let validatedCatalog: { key: string; models: MyModelItemType[] } | undefined;

/** 只返回已由当前凭证确认过的完整目录，不能将持久化恢复误当作本次授权成功。 */
export const peekModelCatalog = (options: ModelReadOptions = {}) => {
  const identity = getModelReadIdentity(options);
  const state = useUserModelStore.getState();
  return identity &&
    state.loaded &&
    state.identity === identity.identity &&
    validatedCatalog?.key === identity.key &&
    validatedCatalog.models === state.modelList
    ? state
    : undefined;
};

/** 所有业务复用此入口；仅实际消费者请求，选择器展开可显式校验版本，不在顶层预加载。 */
export const ensureModelCatalog = async (
  options: ModelReadOptions & { refresh?: boolean } = {}
) => {
  const identity = getModelReadIdentity(options);
  if (!identity) throw new Error('Model viewer identity is unavailable');
  const cached = peekModelCatalog(options);
  if (cached && !options.refresh && !cached.loading) return cached;
  await useUserModelStore.getState().loadModelCatalog(identity.load);
  const state = useUserModelStore.getState();
  if (
    getModelReadIdentity(options)?.key !== identity.key ||
    state.identity !== identity.identity ||
    !state.loaded
  ) {
    throw new Error('Model viewer identity changed during loading');
  }
  validatedCatalog = { key: identity.key, models: state.modelList };
  return state;
};

/** 类型与能力过滤共用于默认解析和选择候选，保持两者的可选范围一致。 */
export const matchesModelFilter = <T extends ModelTypeEnum>(
  model: MyModelItemType,
  options: ModelFilter<T>
): model is ModelOfType<T> =>
  model.isActive !== false &&
  (!options.modelType || model.type === options.modelType) &&
  (!options.vision || ('vision' in model.config && !!model.config.vision)) &&
  (!options.excludeHidden || !('hidden' in model.config && model.config.hidden));

/** 获取真正用于选择的候选列表；保留服务端 catalog 排序，不在业务页面预先下发。 */
export const getModelList = async <T extends ModelTypeEnum = ModelTypeEnum>(
  options: ModelFilter<T> & { refresh?: boolean } = {}
) => {
  const catalog = await ensureModelCatalog(options);
  return catalog.modelList.filter((model): model is ModelOfType<T> =>
    matchesModelFilter(model, options)
  );
};

export type ModelDetailQuery<T extends ModelTypeEnum = ModelTypeEnum> = ModelFilter<T> & {
  modelId?: string | null;
  model?: string | null;
};

type ModelCatalogState = NonNullable<ReturnType<typeof peekModelCatalog>>;

/**
 * 只有静态模型引用才需要查目录：空值不查，工作流动态引用在运行时求值也不能当成静态 ID。
 * 返回 undefined 表示本次查询没有可解析的模型身份。
 */
const getStaticModelQuery = (options: ModelDetailQuery) => {
  if (typeof options.modelId === 'string' && !isEmptyModelValue(options.modelId)) {
    return { modelId: options.modelId };
  }
  if (
    isEmptyModelValue(options.modelId) &&
    typeof options.model === 'string' &&
    !isEmptyModelValue(options.model)
  ) {
    return { model: options.model };
  }
  return undefined;
};

/** 目录内精确定位模型；失效 ID 不回退默认，也不按旧名称替换。 */
const resolveModelDetail = <T extends ModelTypeEnum = ModelTypeEnum>(
  catalog: ModelCatalogState,
  options: ModelDetailQuery<T>
) => {
  const query = getStaticModelQuery(options);
  if (!query) return undefined;
  const model = query.modelId
    ? catalog.modelMap[query.modelId]
    : catalog.modelList.find((item) => isSystemModel(item) && item.model === query.model);
  return model && matchesModelFilter(model, options) ? model : undefined;
};

/** 精确读取当前模型能力；空值不请求，非空失效 ID 不回退默认，也不按旧名称替换。 */
export const getModelDetail = async <T extends ModelTypeEnum = ModelTypeEnum>(
  options: ModelDetailQuery<T>
) => {
  // 没有静态模型身份时不发起目录请求，保持旧调用方的行为。
  if (!getStaticModelQuery(options)) return;
  const catalog = await ensureModelCatalog(options);
  return resolveModelDetail(catalog, options);
};

/**
 * 同步读取模型详情：只使用已就绪的目录，绝不发起请求。
 * 目录未就绪或身份不匹配时返回 undefined，供同步校验路径跳过本轮判定。
 */
export const peekModelDetail = <T extends ModelTypeEnum = ModelTypeEnum>(
  options: ModelDetailQuery<T>
) => {
  const catalog = peekModelCatalog(options);
  return catalog ? resolveModelDetail(catalog, options) : undefined;
};

/** 业务默认优先，再使用 catalog 有效系统默认，最后补能力过滤后的首个系统模型；不负责写入任何业务状态。 */
export const getModelDefault = async <T extends ModelTypeEnum>(
  options: ModelFilter<T> & {
    modelType: T;
    businessDefaultModelId?: string;
    defaultKey?: keyof ModelDefaultIds;
  }
) => {
  const catalog = await ensureModelCatalog(options);
  const defaultKey = options.defaultKey ?? options.modelType;
  const businessModel = options.businessDefaultModelId
    ? catalog.modelMap[options.businessDefaultModelId]
    : undefined;
  if (businessModel && matchesModelFilter(businessModel, options)) return businessModel;

  const systemDefaultId = catalog.defaultModelIds[defaultKey];
  const systemDefaultModel = systemDefaultId ? catalog.modelMap[systemDefaultId] : undefined;
  if (
    systemDefaultModel &&
    isSystemModel(systemDefaultModel) &&
    matchesModelFilter(systemDefaultModel, options)
  ) {
    return systemDefaultModel;
  }
  if (defaultKey === 'datasetImageLLM' || defaultKey === 'chatTitleLLM') return;
  return catalog.modelList.find(
    (model): model is ModelOfType<T> => isSystemModel(model) && matchesModelFilter(model, options)
  );
};
