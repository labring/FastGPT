import {
  createModelHandle,
  getCachedModelHandle,
  publishModelHandle
} from '@fastgpt/service/core/ai/config/handle';
import type { SystemDefaultModelType } from '@fastgpt/service/core/ai/type';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

/** 测试显式注入目录，不再依赖 Node 全局变量。默认值按当前真实 handle 的槽位读取。 */
export const getModelTestDefaults = (): SystemDefaultModelType => {
  const handle = getCachedModelHandle();
  const defaults: SystemDefaultModelType = {};
  if (!handle) return defaults;
  for (const slot of [
    'llm',
    'embedding',
    'rerank',
    'tts',
    'stt',
    'datasetTextLLM',
    'datasetImageLLM',
    'chatTitleLLM'
  ] as const) {
    try {
      Object.assign(defaults, { [slot]: handle.getDefaultModelData(slot) });
    } catch {}
  }
  return defaults;
};

/** 局部覆盖测试目录并发布新快照；未指定的数据保留，避免测试回写冻结的共享对象。 */
export const setModelTestSnapshot = (patch: Partial<Parameters<typeof createModelHandle>[0]>) => {
  const previous = getCachedModelHandle();
  publishModelHandle(
    createModelHandle({
      defaultModels: getModelTestDefaults(),
      configuredDefaultModelIds: previous?.configuredDefaultModelIds ?? {},
      revision: previous?.revision ?? 0,
      version: previous?.version ?? 'test-catalog',
      ...patch,
      // 某些目录/权限测试只提供 ID；旧 active-list fixture 的省略状态在测试中仍表示启用。
      models: (patch.models ?? previous?.getAllModels() ?? []).map((model) => ({
        ...model,
        isActive: model.isActive ?? true
      }))
    })
  );
};

/** 旧测试的 ID/名称索引转换为唯一模型列表；仅作为 fixture 输入，不公开生产 Map。 */
export const setModelTestMap = (map?: Map<string, SystemModelDataType>) => {
  if (!map) return publishModelHandle(undefined);
  setModelTestSnapshot({
    models: [...new Map([...map.values()].map((model) => [model.modelId, model])).values()]
  });
};

export const getModelTestMap = () =>
  new Map(
    (getCachedModelHandle()?.getAllModels() ?? []).flatMap((model) => [
      [`id:${model.modelId}`, model] as const,
      [`model:${model.model}`, model] as const
    ])
  );

/** 新增/替换 fixture 模型，显式重新发布而不是修改 handle 内部 Map。 */
export const addModelTestModel = (model: SystemModelDataType) =>
  setModelTestSnapshot({
    models: [
      ...(getCachedModelHandle()?.getAllModels() ?? []).filter(
        (item) => item.modelId !== model.modelId
      ),
      model
    ]
  });
