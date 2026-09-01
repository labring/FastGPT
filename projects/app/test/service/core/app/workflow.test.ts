import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getChatModelNameListByModules } from '@/service/core/app/workflow';

const activeModelId = '68ee0bd23d17260b7829b137';
const disabledModelId = '68ee0bd23d17260b7829b138';
const embeddingModelId = '68ee0bd23d17260b7829b139';

const activeModel = {
  modelId: activeModelId,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'gpt-test',
  name: 'GPT test',
  scope: 'system',
  isActive: true,
  isCustom: false,
  config: {}
} as SystemModelDataType;

const createNode = ({
  value,
  key = NodeInputKeyEnum.aiModelId,
  flowNodeType = FlowNodeTypeEnum.chatNode
}: {
  value: unknown;
  key?: NodeInputKeyEnum;
  flowNodeType?: FlowNodeTypeEnum;
}) =>
  ({
    flowNodeType,
    inputs: [{ key, value }]
  }) as StoreNodeItemType;

describe('getChatModelNameListByModules', () => {
  const originalModelMap = global.systemModelMap;

  beforeEach(() => {
    const disabledModel = {
      ...activeModel,
      modelId: disabledModelId,
      model: 'disabled-model',
      name: 'Disabled model',
      isActive: false
    } as SystemModelDataType;
    const embeddingModel = {
      ...activeModel,
      modelId: embeddingModelId,
      model: 'embedding-model',
      name: 'Embedding model',
      type: ModelTypeEnum.embedding
    } as SystemModelDataType;

    global.systemModelMap = new Map([
      [`id:${activeModelId}`, activeModel],
      [`model:${activeModel.model}`, activeModel],
      [`id:${disabledModelId}`, disabledModel],
      [`id:${embeddingModelId}`, embeddingModel]
    ]);
  });

  afterEach(() => {
    global.systemModelMap = originalModelMap;
  });

  it('returns deduplicated display names for valid static LLM references', () => {
    const nodes = [
      createNode({ value: activeModelId }),
      createNode({ value: activeModel.model, key: NodeInputKeyEnum.aiModel }),
      createNode({ value: activeModelId })
    ];

    expect(getChatModelNameListByModules(nodes)).toEqual(['GPT test']);
  });

  it('skips unresolved references without blocking chat initialization', () => {
    const nodes = [
      createNode({ value: 'missing-model-id' }),
      createNode({ value: disabledModelId }),
      createNode({ value: embeddingModelId }),
      createNode({ value: ['nodeId', 'outputId'] }),
      createNode({ value: '{{dynamicModelId}}' }),
      createNode({ value: undefined }),
      createNode({ value: activeModelId, flowNodeType: FlowNodeTypeEnum.pluginModule })
    ];

    expect(() => getChatModelNameListByModules(nodes)).not.toThrow();
    expect(getChatModelNameListByModules(nodes)).toEqual([]);
  });
});
