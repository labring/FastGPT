import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const { findOneMock, findAppByIdMock } = vi.hoisted(() => ({
  findOneMock: vi.fn(),
  findAppByIdMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    findOne: findOneMock
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: findAppByIdMock
  }
}));

import {
  getAppLatestVersion,
  getAppVersionById
} from '@fastgpt/service/core/app/version/controller';

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
          inputs: [],
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
      chatConfig: {}
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

  it('normalizes the app fallback when no published version exists', async () => {
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) })
    });

    const result = await getAppLatestVersion('app-id', {
      name: 'Legacy app',
      modules: [
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
      chatConfig: {}
    } as any);

    expect(result.nodes).toEqual([]);
    expect(result.chatConfig.welcomeConfig?.welcomeText).toBe('Legacy welcome');
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
      chatConfig: undefined
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
});

describe('getAppVersionById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAppByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(undefined) });
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
              key: NodeInputKeyEnum.instruction,
              label: 'Instruction',
              value: 'Legacy instruction',
              renderTypeList: [FlowNodeInputTypeEnum.hidden]
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: undefined
    };
    findOneMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(version) });

    const result = await getAppVersionById({
      appId: 'app-id',
      versionId: '507f1f77bcf86cd799439011',
      app: {
        chatConfig: {
          instruction: 'Current instruction'
        }
      } as any
    });

    expect(result.nodes).toEqual([]);
    expect(result.chatConfig.instruction).toBe('Legacy instruction');
  });
});
