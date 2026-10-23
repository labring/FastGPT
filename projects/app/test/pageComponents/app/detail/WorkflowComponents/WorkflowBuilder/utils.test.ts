import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeWorkflowBuilderAppliedAppDetail,
  prepareWorkflowBuilderToolSecrets
} from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/utils';
import { getClientToolPreviewNode } from '@/web/core/app/api/tool';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import fixture from '@fastgpt/workflow-core/test/fixtures/basic-static/workflow.json';

vi.mock('@/web/core/app/api/tool', () => ({ getClientToolPreviewNode: vi.fn() }));

describe('prepareWorkflowBuilderToolSecrets', () => {
  const makeNode = (overrides: Partial<StoreNodeItemType> = {}): StoreNodeItemType => ({
    nodeId: 'search',
    name: 'Search',
    flowNodeType: FlowNodeTypeEnum.tool,
    pluginId: 'search-tool',
    source: 'system',
    version: '1.0.0',
    inputs: [
      {
        key: NodeInputKeyEnum.systemInputConfig,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.hidden]
      }
    ],
    outputs: [],
    ...overrides
  });
  const previewTemplate = {
    id: 'search-tool',
    name: 'Search',
    flowNodeType: FlowNodeTypeEnum.tool,
    inputs: [],
    outputs: []
  };

  beforeEach(() => vi.resetAllMocks());

  it('uses current system availability, reuses lookups and keeps archived nodes unchanged', async () => {
    vi.mocked(getClientToolPreviewNode).mockResolvedValue({
      ...previewTemplate,
      hasSystemSecret: true
    });
    const nodes = [makeNode(), makeNode({ nodeId: 'another-search' })];
    const before = structuredClone(nodes);

    const prepared = await prepareWorkflowBuilderToolSecrets({ nodes });

    expect(prepared.map((node) => node.inputs[0].value)).toEqual([
      { type: SystemToolSecretInputTypeEnum.system },
      { type: SystemToolSecretInputTypeEnum.system }
    ]);
    expect(nodes).toEqual(before);
    expect(getClientToolPreviewNode).toHaveBeenCalledExactlyOnceWith({
      appId: 'search-tool',
      source: 'system',
      versionId: '1.0.0',
      lang: undefined
    });
  });

  it.each([false, undefined, 'lookup failed'])(
    'keeps activation pending when availability is %s',
    async (availability) => {
      if (availability === 'lookup failed') {
        vi.mocked(getClientToolPreviewNode).mockRejectedValueOnce(new Error('lookup failed'));
      } else {
        vi.mocked(getClientToolPreviewNode).mockResolvedValue({
          ...previewTemplate,
          hasSystemSecret: availability
        });
      }
      const node = makeNode();

      expect(await prepareWorkflowBuilderToolSecrets({ nodes: [node] })).toEqual([node]);
      expect(node.inputs[0].value).toBeUndefined();
    }
  );

  it('preserves existing choices and defaults and skips nodes that do not need activation', async () => {
    const manualNode = makeNode();
    manualNode.inputs[0].value = {
      type: SystemToolSecretInputTypeEnum.manual,
      value: { apiKey: { secret: 'stored' } }
    };
    const defaultNode = makeNode();
    defaultNode.inputs[0].defaultValue = { type: SystemToolSecretInputTypeEnum.system };
    const nodes = [
      manualNode,
      defaultNode,
      makeNode({ inputs: [] }),
      makeNode({ pluginId: undefined })
    ];
    const before = structuredClone(nodes);

    expect(await prepareWorkflowBuilderToolSecrets({ nodes })).toEqual(before);
    expect(getClientToolPreviewNode).not.toHaveBeenCalled();
  });

  it('resolves toolset identity and isolates requests by source and version', async () => {
    vi.mocked(getClientToolPreviewNode).mockResolvedValue({
      ...previewTemplate,
      hasSystemSecret: true
    });
    const nodes = [
      makeNode(),
      makeNode({ version: '2.0.0' }),
      makeNode({
        pluginId: undefined,
        source: undefined,
        toolConfig: {
          systemToolSet: {
            toolId: 'search-tool',
            source: 'debug:member',
            toolList: []
          }
        }
      })
    ];

    await prepareWorkflowBuilderToolSecrets({ nodes });

    expect(getClientToolPreviewNode).toHaveBeenCalledTimes(3);
    expect(getClientToolPreviewNode).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'search-tool',
        source: 'debug:member',
        versionId: '1.0.0'
      })
    );
  });
});

describe('mergeWorkflowBuilderAppliedAppDetail', () => {
  it('keeps user-owned app metadata while applying Builder chatConfig', () => {
    const document = WorkflowDocumentSchema.parse(structuredClone(fixture));
    document.app.name = 'Builder Result';
    document.app.intro = 'Updated by Builder';
    document.chatConfig.fileSelectConfig = { maxFiles: 1, canSelectFile: true };

    const current = {
      name: 'Old Name',
      intro: 'Old intro',
      chatConfig: {}
    } as Parameters<typeof mergeWorkflowBuilderAppliedAppDetail>[0]['current'];

    expect(
      mergeWorkflowBuilderAppliedAppDetail({
        current,
        chatConfig: document.chatConfig
      })
    ).toMatchObject({
      name: 'Old Name',
      intro: 'Old intro',
      chatConfig: {
        fileSelectConfig: { maxFiles: 1, canSelectFile: true }
      }
    });
  });
});
