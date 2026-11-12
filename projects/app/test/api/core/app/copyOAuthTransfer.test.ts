import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  authUserPer: vi.fn(),
  getAppDraftWorkflow: vi.fn(),
  onCreateApp: vi.fn(),
  copyAvatarImage: vi.fn(),
  refreshAvatar: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));

vi.mock('@fastgpt/service/common/file/image/controller', () => ({
  copyAvatarImage: mocks.copyAvatarImage
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: (fn: (session: string) => Promise<unknown>) => fn('session')
}));

vi.mock('@fastgpt/service/common/s3/sources/avatar', () => ({
  getS3AvatarSource: () => ({ refreshAvatar: mocks.refreshAvatar })
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppDraftWorkflow: mocks.getAppDraftWorkflow
}));

vi.mock('@/pages/api/core/app/create', () => ({
  onCreateApp: mocks.onCreateApp
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn(),
  getI18nAppType: vi.fn(() => 'mcpToolSet')
}));

import copyHandler from '@/pages/api/core/app/copy';

const app = {
  _id: '65f000000000000000000071',
  name: 'source toolset',
  intro: '',
  avatar: '',
  type: AppTypeEnum.mcpToolSet,
  teamId: 'source-team',
  parentId: undefined
};

const buildOAuth = ({ clientSource }: { clientSource: 'cimd' | 'dcr' }) => ({
  schemaVersion: 1,
  clientMode: 'auto',
  clientSource,
  scope: 'read',
  credentialSeq: 4,
  issuer: 'https://as.example.com',
  resource: 'https://mcp.example.com',
  server: {
    issuer: 'https://as.example.com',
    authorizationEndpoint: 'https://as.example.com/authorize',
    tokenEndpoint: 'https://as.example.com/token',
    source: 'discovered',
    fetchedAt: 0
  },
  client: {
    clientId: 'client-id',
    tokenEndpointAuthMethod: clientSource === 'cimd' ? 'none' : 'client_secret_post',
    clientSecret: { secret: 'encrypted-client-secret', value: '' },
    registrationAccessToken: { secret: 'encrypted-registration-token', value: '' }
  },
  token: {
    secret: {
      access_token: { secret: 'encrypted-access-token', value: '' },
      refresh_token: { secret: 'encrypted-refresh-token', value: '' }
    },
    expiresAt: 0,
    obtainedAt: 1
  }
});

const copiedToolSet = () => {
  const params = mocks.onCreateApp.mock.calls[0][0];
  return params.storageNodes[0].toolConfig.mcpToolSet;
};

describe('copy MCP OAuth transfer scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.copyAvatarImage.mockResolvedValue('avatar');
    mocks.refreshAvatar.mockResolvedValue(undefined);
    mocks.onCreateApp.mockResolvedValue('65f000000000000000000072');
    mocks.authUserPer.mockResolvedValue({ tmbId: 'tmb-1', isRoot: false });
  });

  it('keeps credentials for a same-team copy', async () => {
    mocks.authApp.mockResolvedValue({ app, teamId: 'source-team' });
    mocks.getAppDraftWorkflow.mockResolvedValue({
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'toolSet',
          toolConfig: { mcpToolSet: { url: 'https://mcp.example.com', authMode: 'oauth', toolList: [], oauth: buildOAuth({ clientSource: 'dcr' }) } }
        }
      ],
      edges: [],
      chatConfig: {}
    });

    await copyHandler({ body: { appId: '65f000000000000000000071' } } as ApiRequestProps<any>);

    const toolSet = copiedToolSet();
    expect(toolSet.oauth).toMatchObject({
      credentialSeq: 4,
      clientMode: 'auto',
      scope: 'read',
      token: { secret: expect.objectContaining({ access_token: expect.any(Object) }) },
      client: expect.objectContaining({ clientId: 'client-id', clientSecret: expect.any(Object) })
    });
    expect(toolSet.authMode).toBe('oauth');
  });

  it('strips credentials for a cross-team copy while keeping non-secret oauth config', async () => {
    mocks.authApp.mockResolvedValue({ app, teamId: 'other-team' });
    mocks.getAppDraftWorkflow.mockResolvedValue({
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'toolSet',
          toolConfig: { mcpToolSet: { url: 'https://mcp.example.com', authMode: 'oauth', toolList: [], oauth: buildOAuth({ clientSource: 'dcr' }) } }
        }
      ],
      edges: [],
      chatConfig: {}
    });

    await copyHandler({ body: { appId: '65f000000000000000000071' } } as ApiRequestProps<any>);

    const toolSet = copiedToolSet();
    expect(toolSet.authMode).toBe('oauth');
    expect(toolSet.oauth).toMatchObject({
      schemaVersion: 1,
      clientMode: 'auto',
      scope: 'read',
      credentialSeq: 4,
      issuer: 'https://as.example.com',
      resource: 'https://mcp.example.com'
    });
    expect(toolSet.oauth).not.toHaveProperty('token');
    expect(toolSet.oauth).not.toHaveProperty('client');
    expect(JSON.stringify(toolSet.oauth)).not.toContain('encrypted-');
  });

  it('keeps the public CIMD clientId but drops its secrets on cross-team copy', async () => {
    mocks.authApp.mockResolvedValue({ app, teamId: 'other-team' });
    mocks.getAppDraftWorkflow.mockResolvedValue({
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'toolSet',
          toolConfig: { mcpToolSet: { url: 'https://mcp.example.com', authMode: 'oauth', toolList: [], oauth: buildOAuth({ clientSource: 'cimd' }) } }
        }
      ],
      edges: [],
      chatConfig: {}
    });

    await copyHandler({ body: { appId: '65f000000000000000000071' } } as ApiRequestProps<any>);

    const oauth = copiedToolSet().oauth;
    expect(oauth.client).toEqual({ clientId: 'client-id', tokenEndpointAuthMethod: 'none' });
    expect(oauth).not.toHaveProperty('token');
    expect(JSON.stringify(oauth)).not.toContain('encrypted-');
  });
});
