import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SANDBOX_ENABLED_CHAT_METADATA_KEY,
  SandboxUnavailableReasonEnum
} from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const mocks = vi.hoisted(() => ({
  assertSandboxAvailable: vi.fn(),
  authSandboxSession: vi.fn(),
  createAgentSandboxPermissionDeniedError: vi.fn(),
  findAppById: vi.fn(),
  getAppLatestVersion: vi.fn(),
  resolveAppSandboxAvailability: vi.fn()
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authSandboxSession: mocks.authSandboxSession
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  assertSandboxAvailable: mocks.assertSandboxAvailable,
  createAgentSandboxPermissionDeniedError: mocks.createAgentSandboxPermissionDeniedError,
  resolveAppSandboxAvailability: mocks.resolveAppSandboxAvailability
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: mocks.findAppById
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion
}));

import {
  authSandboxRuntimeSession,
  resolveSandboxSessionAvailability
} from '@/service/core/sandbox/access';

const sandboxNode = (enabled: boolean) =>
  ({
    flowNodeType: FlowNodeTypeEnum.agent,
    inputs: [{ key: NodeInputKeyEnum.useAgentSandbox, value: enabled }]
  }) as any;

const appSession = {
  uid: 'user_1',
  teamId: 'team_1',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app_1'
};

describe('resolveSandboxSessionAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.feConfigs = { ...global.feConfigs, show_agent_sandbox: true };
    mocks.resolveAppSandboxAvailability.mockImplementation(async ({ appEnabled }) =>
      appEnabled
        ? { available: true }
        : { available: false, reason: SandboxUnavailableReasonEnum.appDisabled }
    );
    mocks.findAppById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'app_1', modules: [] })
    });
    mocks.getAppLatestVersion.mockResolvedValue({ nodes: [], edges: [], chatConfig: {} });
  });

  it('short-circuits before App queries when the system feature is disabled', async () => {
    global.feConfigs = { ...global.feConfigs, show_agent_sandbox: false };
    mocks.resolveAppSandboxAvailability.mockResolvedValueOnce({
      available: false,
      reason: SandboxUnavailableReasonEnum.systemDisabled
    });

    await expect(resolveSandboxSessionAvailability(appSession)).resolves.toEqual({
      available: false,
      reason: SandboxUnavailableReasonEnum.systemDisabled
    });
    expect(mocks.resolveAppSandboxAvailability).toHaveBeenCalledWith({
      appEnabled: true,
      teamId: 'team_1'
    });
    expect(mocks.findAppById).not.toHaveBeenCalled();
    expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'uses the exact Chat Test metadata switch when it is %s',
    async (appEnabled) => {
      await resolveSandboxSessionAvailability({
        ...appSession,
        chat: {
          source: ChatSourceEnum.test,
          metadata: { [APP_SANDBOX_ENABLED_CHAT_METADATA_KEY]: appEnabled }
        } as any
      });

      expect(mocks.resolveAppSandboxAvailability).toHaveBeenCalledWith({
        appEnabled,
        teamId: 'team_1'
      });
      expect(mocks.findAppById).not.toHaveBeenCalled();
      expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
    }
  );

  it('falls back to current draft nodes only for legacy Chat Test sessions', async () => {
    mocks.findAppById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({ _id: 'app_1', modules: [sandboxNode(true)] })
    });

    await resolveSandboxSessionAvailability({
      ...appSession,
      chat: { source: ChatSourceEnum.test, metadata: {} } as any
    });

    expect(mocks.resolveAppSandboxAvailability).toHaveBeenCalledWith({
      appEnabled: true,
      teamId: 'team_1'
    });
    expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
  });

  it('uses the published version for non-test App sessions', async () => {
    const app = { _id: 'app_1', modules: [] };
    mocks.findAppById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(app) });
    mocks.getAppLatestVersion.mockResolvedValueOnce({
      nodes: [sandboxNode(true)],
      edges: [],
      chatConfig: {}
    });

    await resolveSandboxSessionAvailability({
      ...appSession,
      chat: { source: ChatSourceEnum.online } as any
    });

    expect(mocks.getAppLatestVersion).toHaveBeenCalledWith('app_1', app);
    expect(mocks.resolveAppSandboxAvailability).toHaveBeenCalledWith({
      appEnabled: true,
      teamId: 'team_1'
    });
  });

  it('uses strong system and plan authorization for non-App sources', async () => {
    const skillSession = {
      ...appSession,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill_1'
    };

    await expect(resolveSandboxSessionAvailability(skillSession)).resolves.toEqual({
      available: true
    });
    expect(mocks.assertSandboxAvailable).toHaveBeenCalledWith('team_1');
    expect(mocks.resolveAppSandboxAvailability).not.toHaveBeenCalled();
    expect(mocks.findAppById).not.toHaveBeenCalled();
  });
});

describe('authSandboxRuntimeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.feConfigs = { ...global.feConfigs, show_agent_sandbox: true };
    mocks.authSandboxSession.mockResolvedValue({
      ...appSession,
      chat: {
        source: ChatSourceEnum.test,
        metadata: { [APP_SANDBOX_ENABLED_CHAT_METADATA_KEY]: true }
      }
    });
    mocks.resolveAppSandboxAvailability.mockResolvedValue({ available: true });
    mocks.createAgentSandboxPermissionDeniedError.mockReturnValue(new Error('sandbox denied'));
  });

  it('blocks runtime API access when Sandbox is unavailable', async () => {
    mocks.resolveAppSandboxAvailability.mockResolvedValueOnce({
      available: false,
      reason: SandboxUnavailableReasonEnum.teamPlanUnavailable
    });

    await expect(
      authSandboxRuntimeSession({
        req: {} as any,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        chatId: 'chat_1'
      })
    ).rejects.toThrow('sandbox denied');
  });
});
