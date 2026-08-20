import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const { findOneMock, findMock, aggregateMock, findAppByIdMock } = vi.hoisted(() => ({
  findOneMock: vi.fn(),
  findMock: vi.fn(),
  aggregateMock: vi.fn(),
  findAppByIdMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    findOne: findOneMock,
    find: findMock,
    aggregate: aggregateMock
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: findAppByIdMock
  }
}));

import {
  getAppLatestVersion,
  getAppVersionById,
  getAppPublishedWorkflowMap
} from '@fastgpt/service/core/app/version/controller';

const createAgentVersion = (resources?: unknown) => ({
  _id: '507f1f77bcf86cd799439011',
  nodes: [
    {
      nodeId: 'agent-node',
      name: 'Agent',
      flowNodeType: FlowNodeTypeEnum.appModule,
      pluginId: 'legacy-agent-id',
      inputs: [],
      outputs: []
    }
  ],
  edges: [],
  chatConfig: undefined,
  ...(resources === undefined ? {} : { resources })
});

describe('getAppLatestVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAppByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) });
  });

  it('normalizes a legacy published version before returning it', async () => {
    const scheduledTriggerConfig = {
      cronString: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      defaultPrompt: 'Run scheduled workflow'
    };
    const version = {
      _id: '507f1f77bcf86cd799439011',
      versionName: 'Legacy version',
      nodes: [
        {
          nodeId: 'userGuide',
          name: 'System config',
          flowNodeType: 'userGuide',
          inputs: [
            {
              key: NodeInputKeyEnum.scheduleTrigger,
              label: 'Schedule trigger',
              value: scheduledTriggerConfig,
              renderTypeList: [FlowNodeInputTypeEnum.hidden]
            }
          ],
          outputs: []
        },
        {
          nodeId: 'start',
          name: 'Start',
          flowNodeType: 'workflowStart',
          inputs: [
            {
              key: 'system_input_config',
              label: 'Config',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: null,
              inputList: [{ key: 'secret', label: 'Secret', inputType: 'secret', value: null }]
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'userGuide',
          target: 'start',
          sourceHandle: 'userGuide-source-right',
          targetHandle: 'start-target-left'
        }
      ],
      chatConfig: {},
      resources: []
    };
    const leanMock = vi.fn().mockResolvedValue(version);
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: leanMock })
    });

    const result = await getAppLatestVersion('app-id');

    expect(result.nodes.map((node) => node.nodeId)).toEqual(['start']);
    expect(result.edges).toEqual([]);
    expect(result.chatConfig.scheduledTriggerConfig).toEqual(scheduledTriggerConfig);
    expect(result.nodes[0].inputs[0].selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(result.nodes[0].inputs[0].inputList?.[0]).not.toHaveProperty('value');
  });

  it('returns an empty workflow when no published version exists', async () => {
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) })
    });

    const result = await getAppLatestVersion('app-id', {
      name: 'App without version'
    } as any);

    expect(result.nodes).toEqual([]);
    expect(result.resources).toEqual([]);
  });

  it('preserves a legacy version config when the current app config differs', async () => {
    const version = {
      _id: '507f1f77bcf86cd799439011',
      versionName: 'Legacy version',
      nodes: [
        {
          nodeId: 'userGuide',
          name: 'System config',
          flowNodeType: 'userGuide',
          inputs: [
            {
              key: NodeInputKeyEnum.welcomeText,
              label: 'Welcome text',
              value: 'Legacy welcome',
              renderTypeList: [FlowNodeInputTypeEnum.hidden]
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: undefined,
      resources: []
    };
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(version) })
    });

    const result = await getAppLatestVersion('app-id', {
      chatConfig: {
        welcomeConfig: {
          welcomeText: 'Current welcome'
        },
        welcomeText: 'Current welcome'
      }
    } as any);

    expect(result.nodes).toEqual([]);
    expect(result.chatConfig.welcomeConfig?.welcomeText).toBe('Legacy welcome');
    expect(result.chatConfig.welcomeText).toBe('Legacy welcome');
  });

  it('reads the version pointed by publishedVersionId', async () => {
    const version = {
      _id: '507f1f77bcf86cd799439011',
      versionName: 'Pinned published',
      nodes: [],
      edges: [],
      chatConfig: {},
      resources: [{ type: 'skill', id: 'pinned-skill' }]
    };
    findOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(version)
    });

    const result = await getAppLatestVersion('app-id', {
      publishedVersionId: '507f1f77bcf86cd799439011'
    } as any);

    expect(findOneMock).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      appId: 'app-id'
    });
    expect(result.resources).toEqual([{ type: 'skill', id: 'pinned-skill' }]);
  });
});

describe('getAppVersionById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAppByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) });
  });

  it('extracts resources from a version that has not been migrated', async () => {
    findOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(createAgentVersion())
    });

    const result = await getAppVersionById({
      appId: 'app-id',
      versionId: '507f1f77bcf86cd799439011'
    });

    expect(result.resources).toEqual([{ type: 'agent', id: 'legacy-agent-id' }]);
  });

  it('keeps an empty snapshot when resources is an empty array', async () => {
    findOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(createAgentVersion([]))
    });

    const result = await getAppVersionById({
      appId: 'app-id',
      versionId: '507f1f77bcf86cd799439011'
    });

    expect(result.resources).toEqual([]);
  });
});

describe('getAppPublishedWorkflowMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the pointer version when it belongs to the same app', async () => {
    const versionId = '507f1f77bcf86cd799439011';
    findMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: versionId,
          appId: 'app-id',
          nodes: [{ nodeId: 'pointer-node' }]
        }
      ])
    });

    const result = await getAppPublishedWorkflowMap([
      {
        _id: 'app-id',
        publishedVersionId: versionId
      } as any
    ]);

    expect(aggregateMock).not.toHaveBeenCalled();
    expect(result.get('app-id')?.nodes.map((node) => node.nodeId)).toEqual(['pointer-node']);
  });

  it('ignores a pointer that belongs to another app and falls back to latest publish', async () => {
    const foreignVersionId = '507f1f77bcf86cd799439012';
    findMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: foreignVersionId,
          appId: 'other-app',
          nodes: [{ nodeId: 'foreign-node' }]
        }
      ])
    });
    aggregateMock.mockResolvedValue([
      {
        _id: 'app-id',
        doc: {
          _id: '507f1f77bcf86cd799439011',
          appId: 'app-id',
          nodes: [{ nodeId: 'own-node' }]
        }
      }
    ]);

    const result = await getAppPublishedWorkflowMap([
      {
        _id: 'app-id',
        publishedVersionId: foreignVersionId
      } as any
    ]);

    expect(aggregateMock).toHaveBeenCalled();
    expect(result.get('app-id')?.nodes.map((node) => node.nodeId)).toEqual(['own-node']);
  });
});
