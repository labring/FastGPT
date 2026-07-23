import { describe, expect, it } from 'vitest';
import createHandler from '@/pages/api/support/mcp/create';
import listHandler from '@/pages/api/support/mcp/list';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { TeamApikeyCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('support/mcp publish management', () => {
  it('returns only MCP publications created by the current member', async () => {
    const { manager, members } = await getFakeUsers(1);
    const [member] = members;
    await MongoMcpKey.create([
      {
        teamId: manager.teamId,
        tmbId: manager.tmbId,
        name: 'manager mcp',
        apps: []
      },
      {
        teamId: member.teamId,
        tmbId: member.tmbId,
        name: 'member mcp',
        apps: []
      }
    ]);

    const result = await Call(listHandler, { auth: manager });

    expect(result.code).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('manager mcp');
    expect(result.data[0].authProxy).toBe(false);
  });

  it('allows a team owner to publish MCP with authProxy enabled', async () => {
    const { owner } = await getFakeUsers(1);
    const app = await MongoApp.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'owner app',
      type: AppTypeEnum.simple
    });

    const result = await Call(createHandler, {
      auth: owner,
      body: {
        name: 'owner proxy mcp',
        authProxy: true,
        apps: [
          {
            appId: String(app._id),
            appName: app.name,
            toolName: 'owner_tool',
            description: 'Owner tool'
          }
        ]
      }
    });

    expect(result.code).toBe(200);
    expect(
      await MongoMcpKey.findOne({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'owner proxy mcp',
        authProxy: true
      })
    ).not.toBeNull();
  });

  it('rejects authProxy when a non-owner publishes MCP', async () => {
    const { members } = await getFakeUsers(1);
    const [member] = members;
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: member.teamId,
      resourceId: null,
      tmbId: member.tmbId,
      permission: TeamApikeyCreatePermissionVal
    });
    const app = await MongoApp.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'member app',
      type: AppTypeEnum.simple
    });

    const result = await Call(createHandler, {
      auth: member,
      body: {
        name: 'member proxy mcp',
        authProxy: true,
        apps: [
          {
            appId: String(app._id),
            appName: app.name,
            toolName: 'member_tool',
            description: 'Member tool'
          }
        ]
      }
    });

    expect(result.code).toBe(500);
    expect(await MongoMcpKey.findOne({ name: 'member proxy mcp' })).toBeNull();
  });
});
