import * as debugapi from '@/pages/api/core/workflow/debug';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

/**
 * Module 11: workflow debug model auth (design A3).
 *
 * Injects a private (non-system) model from another team, then verifies a debug
 * run referencing it is rejected with the model auth error (AUTH-TC06), while
 * system models pass (AUTH-TC07).
 */
const privateModelId = '68ad85a7463006c963799a11';
const systemModelId = 'gpt-5';

describe('workflow debug model auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue({ tmbId: 'member-id' });
    mocks.authApp.mockResolvedValue({ app });
    mocks.createChatUsageRecord.mockResolvedValue('usage-id');
    mocks.getNanoid.mockReturnValue('generated-id');
    mocks.getRunningUserInfoByTmbId.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'member-id'
    });
    mocks.prepareWorkflowFileQuery.mockResolvedValue({
      query: [],
      maxFileAmount: 10,
      maxBytesPerFile: 1024
    });
    mocks.dispatchWorkFlow.mockResolvedValue({
      debugResponse: {
        memoryEdges: [],
        memoryNodes: [],
        entryNodeIds: [],
        nodeResponses: {}
      },
      newVariables: {},
      flatNodeResponses: []
    });
    mocks.getWorkflowFinalResponseData.mockReturnValue([]);
    mocks.composeDebugNodeResponseMap.mockReturnValue({});
    mocks.authModels.mockResolvedValue({});
  });

  it('rejects unauthorized private model in nodes (AUTH-TC06)', async () => {
    mocks.authModels.mockRejectedValue(ModelErrEnum.unAuthModel);

    await expect(
      Call(debugapi.default, {
        headers: {},
        body: {
          appId,
          nodes: [
            {
              inputs: [{ key: 'modelId', value: privateModelId }]
            }
          ],
          edges: [],
          query: [],
          history: []
        }
      })
    ).rejects.toBe(ModelErrEnum.unAuthModel);
    expect(mocks.authModels).toHaveBeenCalledWith(
      expect.objectContaining({
        modelIds: [privateModelId],
        per: ReadPermissionVal,
        authToken: true
      })
    );
    expect(mocks.dispatchWorkFlow).not.toHaveBeenCalled();
  });

  it('allows system model in nodes (AUTH-TC07)', async () => {
    const res = await Call(debugapi.default, {
      headers: {},
      body: {
        appId,
        nodes: [
          {
            inputs: [{ key: 'modelId', value: systemModelId }]
          }
        ],
        edges: [],
        query: [],
        history: []
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();
    expect(mocks.authModels).toHaveBeenCalledWith(
      expect.objectContaining({
        modelIds: [systemModelId],
        per: ReadPermissionVal,
        authToken: true
      })
    );
    expect(mocks.dispatchWorkFlow).toHaveBeenCalledTimes(1);
  });

  it('authenticates legacy node and chat config model references during the upgrade window', async () => {
    const res = await Call(debugapi.default, {
      headers: {},
      body: {
        appId,
        nodes: [
          {
            inputs: [{ key: 'model', value: 'legacy-node-model' }]
          }
        ],
        edges: [],
        query: [],
        history: [],
        chatConfig: {
          questionGuide: { open: true, model: 'legacy-guide-model' },
          ttsConfig: { type: 'model', modelId: 'canonical-tts-model' }
        }
      }
    });

    expect(res.code).toBe(200);
    expect(mocks.authModels).toHaveBeenCalledWith(
      expect.objectContaining({
        modelIds: expect.arrayContaining([
          'legacy-node-model',
          'legacy-guide-model',
          'canonical-tts-model'
        ]),
        per: ReadPermissionVal
      })
    );
  });
});

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  authCert: vi.fn(),
  authModels: vi.fn(),
  composeDebugNodeResponseMap: vi.fn(),
  createChatUsageRecord: vi.fn(),
  dispatchWorkFlow: vi.fn(),
  getNanoid: vi.fn(),
  getRunningUserInfoByTmbId: vi.fn(),
  getWorkflowFinalResponseData: vi.fn(),
  prepareWorkflowFileQuery: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI:
    (handler: (...args: any[]) => Promise<unknown>) =>
    async (...args: any[]) => ({
      code: 200,
      data: await handler(...args)
    })
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  authModels: mocks.authModels
}));

vi.mock('@fastgpt/service/support/permission/auth/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/permission/auth/common')>()),
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: mocks.dispatchWorkFlow
}));

vi.mock('@fastgpt/service/core/workflow/utils/fileLimits', () => ({
  prepareWorkflowFileQuery: mocks.prepareWorkflowFileQuery
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: mocks.getRunningUserInfoByTmbId
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createChatUsageRecord: mocks.createChatUsageRecord
}));

vi.mock('@fastgpt/global/common/string/tools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/global/common/string/tools')>()),
  getNanoid: mocks.getNanoid
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: () => 'zh-CN'
}));

vi.mock('@/service/core/workflow/nodeResponse', () => ({
  composeDebugNodeResponseMap: mocks.composeDebugNodeResponseMap,
  getWorkflowFinalResponseData: mocks.getWorkflowFinalResponseData
}));

import handler from '@/pages/api/core/workflow/debug';

const appId = '68ad85a7463006c963799a05';
const app = {
  _id: appId,
  name: 'Workflow app',
  teamId: 'team-id',
  tmbId: 'owner-id',
  chatConfig: { variables: [] }
};

describe('workflow debug API chatId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue({ tmbId: 'member-id' });
    mocks.authApp.mockResolvedValue({ app });
    mocks.getRunningUserInfoByTmbId.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'member-id'
    });
    mocks.prepareWorkflowFileQuery.mockResolvedValue({
      query: [],
      maxFileAmount: 10,
      maxBytesPerFile: 1024
    });
    mocks.dispatchWorkFlow.mockResolvedValue({
      debugResponse: {
        memoryEdges: [],
        memoryNodes: [],
        entryNodeIds: [],
        nodeResponses: {}
      },
      newVariables: {},
      flatNodeResponses: []
    });
    mocks.getWorkflowFinalResponseData.mockReturnValue([]);
    mocks.composeDebugNodeResponseMap.mockReturnValue({});
  });

  it('passes the upload session chatId to workflow dispatch', async () => {
    mocks.getNanoid.mockReturnValue('response-chat-item-id');

    await handler(
      {
        body: {
          appId,
          usageId: 'usage-id',
          chatId: 'debug-session-chat-id'
        },
        headers: { origin: 'https://fastgpt.example.com' }
      } as any,
      {} as any
    );

    expect(mocks.dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'debug-session-chat-id',
        responseChatItemId: 'response-chat-item-id',
        usageId: 'usage-id'
      })
    );
    expect(mocks.createChatUsageRecord).not.toHaveBeenCalled();
    expect(mocks.getNanoid).toHaveBeenCalledTimes(1);
  });

  it('generates a dispatch chatId when an older client does not provide one', async () => {
    mocks.getNanoid
      .mockReturnValueOnce('response-chat-item-id')
      .mockReturnValueOnce('generated-debug-chat-id');
    mocks.createChatUsageRecord.mockResolvedValue('generated-usage-id');

    await handler(
      {
        body: { appId },
        headers: {}
      } as any,
      {} as any
    );

    expect(mocks.dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'generated-debug-chat-id',
        responseChatItemId: 'response-chat-item-id',
        usageId: 'generated-usage-id'
      })
    );
    expect(mocks.createChatUsageRecord).toHaveBeenCalledTimes(1);
    expect(mocks.getNanoid).toHaveBeenCalledTimes(2);
  });
});
