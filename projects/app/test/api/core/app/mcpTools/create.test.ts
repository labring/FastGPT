import { describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { CreateMcpToolsBodyType } from '@fastgpt/global/openapi/core/app/mcpTools/api';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

// 先导入测试夹具以安装统一入口 / 鉴权 mock，再导入路由。
import * as createApi from '@/pages/api/core/app/mcpTools/create';

// 创建路由会做 SSRF 校验（DNS 解析）；本用例只关心入库配置，避免依赖外网 DNS。
vi.mock('@fastgpt/service/core/app/mcp', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/core/app/mcp')>();
  return {
    ...mod,
    assertMCPUrlNotInternal: vi.fn(async () => undefined)
  };
});

vi.mock('@fastgpt/service/common/middle/tracks/utils', () => ({
  pushTrack: { createApp: vi.fn() }
}));

const grantCreatePermission = async (teamId: string, tmbId: string) => {
  await MongoResourcePermission.findOneAndUpdate(
    {
      resourceType: 'team',
      teamId,
      resourceId: null,
      tmbId
    },
    { permission: TeamAppCreatePermissionVal },
    { upsert: true }
  );
};

const readStoredToolSet = async (appId: string) => {
  const version = await MongoAppVersion.findOne({ appId }).lean();
  expect(version).toBeTruthy();
  return (version as any).nodes[0].toolConfig.mcpToolSet;
};

describe('mcpTools create api', () => {
  it('creates an oauth tool set with an empty tool list', async () => {
    const users = await getFakeUsers(1);
    const user = users.members[0];
    await grantCreatePermission(user.teamId, user.tmbId);

    const body: CreateMcpToolsBodyType = {
      name: 'oauth-toolset',
      url: 'https://mcp.example.com/mcp',
      authMode: 'oauth',
      clientMode: 'auto',
      toolList: []
    };

    const res = await Call<CreateMcpToolsBodyType, Record<string, never>, string>(createApi.default, {
      auth: user,
      body
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    expect(typeof res.data).toBe('string');

    const app = await MongoApp.findById(res.data).lean();
    expect(app?.type).toBe(AppTypeEnum.mcpToolSet);

    const toolSet = await readStoredToolSet(res.data);
    expect(toolSet).toMatchObject({
      authMode: 'oauth',
      url: body.url,
      toolList: [],
      oauth: {
        schemaVersion: 1,
        clientMode: 'auto',
        credentialSeq: 0
      }
    });
    // OAuth 模式不写入 headerSecret。
    expect(toolSet.headerSecret).toBeUndefined();
  });

  it('creates an oauth tool set with explicit client mode and scope', async () => {
    const users = await getFakeUsers(1);
    const user = users.members[0];
    await grantCreatePermission(user.teamId, user.tmbId);

    const body: CreateMcpToolsBodyType = {
      name: 'oauth-toolset-scoped',
      url: 'https://mcp.example.com/mcp',
      authMode: 'oauth',
      clientMode: 'dcr',
      scope: 'read write',
      toolList: []
    };

    const res = await Call<CreateMcpToolsBodyType, Record<string, never>, string>(createApi.default, {
      auth: user,
      body
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const toolSet = await readStoredToolSet(res.data);
    expect(toolSet.oauth).toMatchObject({
      schemaVersion: 1,
      clientMode: 'dcr',
      scope: 'read write',
      credentialSeq: 0
    });
  });

  it('rejects an empty tool list in headers mode', async () => {
    const users = await getFakeUsers(1);
    const user = users.members[0];
    await grantCreatePermission(user.teamId, user.tmbId);

    const res = await Call<CreateMcpToolsBodyType, Record<string, never>, string>(createApi.default, {
      auth: user,
      body: {
        name: 'headers-toolset',
        url: 'https://mcp.example.com/mcp',
        authMode: 'headers',
        toolList: []
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeTruthy();
  });
});
