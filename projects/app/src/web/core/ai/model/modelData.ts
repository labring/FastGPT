import { useUserStore } from '@/web/support/user/useUserStore';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/defaultModel';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';
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

/** 精确读取当前模型能力；空值不请求，非空失效 ID 不回退默认，也不按旧名称替换。 */
export const getModelDetail = async <T extends ModelTypeEnum = ModelTypeEnum>(
  options: ModelFilter<T> & { modelId?: string | null; model?: string | null }
) => {
  if (isEmptyModelValue(options.modelId) && isEmptyModelValue(options.model)) return;
  // 工作流动态引用在运行时求值，不能当成静态 ID 发起目录查询。
  if (!isEmptyModelValue(options.modelId) && typeof options.modelId !== 'string') return;
  if (isEmptyModelValue(options.modelId) && typeof options.model !== 'string') return;
  const catalog = await ensureModelCatalog(options);
  const model = !isEmptyModelValue(options.modelId)
    ? catalog.modelMap[options.modelId!]
    : catalog.modelList.find((item) => item.model === options.model);
  return model && matchesModelFilter(model, options) ? model : undefined;
};

/** 业务默认优先，再使用 catalog 有效默认，最后补能力过滤后的首项；不负责写入任何业务状态。 */
export const getModelDefault = async <T extends ModelTypeEnum>(
  options: ModelFilter<T> & {
    modelType: T;
    businessDefaultModelId?: string;
    defaultKey?: keyof ModelDefaultIds;
  }
) => {
  const catalog = await ensureModelCatalog(options);
  const defaultKey = options.defaultKey ?? options.modelType;
  const candidates = [options.businessDefaultModelId, catalog.defaultModelIds[defaultKey]];
  for (const id of candidates) {
    const model = id ? catalog.modelMap[id] : undefined;
    if (model && matchesModelFilter(model, options)) return model;
  }
  if (defaultKey === 'chatTitleLLM') return;
  return catalog.modelList.find((model): model is ModelOfType<T> =>
    matchesModelFilter(model, options)
  );
};
