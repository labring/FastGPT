import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as switchTeamApi from '@/pages/api/admin/team/switch';
import * as listAppsApi from '@/pages/api/core/app/list';
import * as listDatasetsApi from '@/pages/api/core/dataset/list';
import * as listMcpApi from '@/pages/api/support/mcp/list';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authMcp } from '@fastgpt/service/support/permission/mcp/auth';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import * as sessionService from '@fastgpt/service/support/user/session';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { Call } from '@test/utils/request';

describe('PUT /api/admin/team/switch', () => {
  let rootUser: any;
  let rootOwnTeam: any;
  let rootOwnTmb: any;
  let tenantUser: any;
  let tenantTeam: any;
  let tenantOwnerTmb: any;

  beforeEach(async () => {
    [rootUser, tenantUser] = await MongoUser.create([
      {
        username: 'root',
        password: 'rootpassword',
        status: UserStatusEnum.active
      },
      {
        username: 'tenant_user',
        password: 'userpassword',
        status: UserStatusEnum.active
      }
    ]);

    [rootOwnTeam, tenantTeam] = await MongoTeam.create([
      {
        name: 'Root Default Team',
        ownerId: rootUser._id
      },
      {
        name: 'Customer Production Team',
        ownerId: tenantUser._id
      }
    ]);

    [rootOwnTmb, tenantOwnerTmb] = await MongoTeamMember.create([
      {
        teamId: rootOwnTeam._id,
        userId: rootUser._id,
        name: 'Owner',
        role: TeamMemberRoleEnum.owner,
        status: TeamMemberStatusEnum.active,
        isSetMemberName: true
      },
      {
        teamId: tenantTeam._id,
        userId: tenantUser._id,
        name: 'Tenant Owner',
        role: TeamMemberRoleEnum.owner,
        status: TeamMemberStatusEnum.active,
        isSetMemberName: true
      }
    ]);

    vi.clearAllMocks();
  });

  it('switches root into any tenant team, preserves isRoot session, cleans old session and logs audit', async () => {
    const createSessionSpy = vi.spyOn(sessionService, 'createUserSession');
    const delSessionSpy = vi.spyOn(sessionService, 'delUserSession');
    const oldSessionId = 'old-root-session-id';

    const res = await Call(switchTeamApi.default, {
      method: 'PUT',
      body: {
        teamId: String(tenantTeam._id)
      },
      headers: {
        'x-forwarded-for': '10.0.0.8'
      },
      auth: {
        userId: String(rootUser._id),
        teamId: String(rootOwnTeam._id),
        tmbId: String(rootOwnTmb._id),
        isRoot: true,
        sessionId: oldSessionId
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data.teamId).toBe(String(tenantTeam._id));
    expect(res.data.token).toContain(`${String(rootUser._id)}:`);

    // 新会话携带目标团队且严格保留 isRoot=true，旧会话被同步清理
    expect(createSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: String(rootUser._id),
        teamId: String(tenantTeam._id),
        tmbId: res.data.tmbId,
        isRoot: true
      })
    );
    expect(delSessionSpy).toHaveBeenCalledWith(oldSessionId);

    const updatedRoot = await MongoUser.findById(rootUser._id).lean();
    expect(String(updatedRoot?.lastLoginTmbId)).toBe(res.data.tmbId);

    const switchedRootTmb = await MongoTeamMember.findById(res.data.tmbId).lean();
    expect(switchedRootTmb?.lastSwitchTime).toBeInstanceOf(Date);

    expect(addAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tmbId: res.data.tmbId,
        teamId: String(tenantTeam._id),
        event: AdminAuditEventEnum.ADMIN_SWITCH_TEAM,
        params: expect.objectContaining({
          name: 'root',
          sourceTeamId: String(rootOwnTeam._id),
          targetTeamId: String(tenantTeam._id),
          targetTeamName: 'Customer Production Team'
        })
      })
    );
  });

  it('grants switched root full visibility and owner permissions on private apps, datasets, outlinks and mcp keys', async () => {
    const switchRes = await Call(switchTeamApi.default, {
      method: 'PUT',
      body: { teamId: String(tenantTeam._id) },
      auth: {
        userId: String(rootUser._id),
        teamId: String(rootOwnTeam._id),
        tmbId: String(rootOwnTmb._id),
        isRoot: true,
        sessionId: 'root-init-session'
      } as any
    });
    expect(switchRes.code).toBe(200);

    // 租户成员创建的私有应用、私有知识库、外链与 MCP 发布记录（无 root ACL 记录）
    const privateApp = await MongoApp.create({
      teamId: tenantTeam._id,
      tmbId: tenantOwnerTmb._id,
      name: 'Private Tenant Workflow',
      type: AppTypeEnum.workflow,
      modules: []
    });
    const privateDataset = await MongoDataset.create({
      teamId: tenantTeam._id,
      tmbId: tenantOwnerTmb._id,
      name: 'Private Tenant Dataset',
      type: DatasetTypeEnum.dataset,
      vectorModel: 'text-embedding-3-small',
      agentModel: 'gpt-4o-mini'
    });
    const tenantOutLink = await MongoOutLink.create({
      shareId: 'share-tenant-1',
      teamId: tenantTeam._id,
      tmbId: tenantOwnerTmb._id,
      appId: privateApp._id,
      name: 'Tenant Share Link',
      type: PublishChannelEnum.share
    });
    const tenantMcp = await MongoMcpKey.create({
      teamId: tenantTeam._id,
      tmbId: tenantOwnerTmb._id,
      name: 'Tenant MCP Server',
      key: 'mcp-key-1',
      apps: []
    });

    const switchedRootAuth = {
      userId: String(rootUser._id),
      teamId: String(tenantTeam._id),
      tmbId: switchRes.data.tmbId,
      isRoot: true,
      sessionId: switchRes.data.token
    } as any;

    const [appsRes, datasetsRes, mcpRes] = await Promise.all([
      Call(listAppsApi.default, { body: {}, auth: switchedRootAuth }),
      Call(listDatasetsApi.default, { body: {}, auth: switchedRootAuth }),
      Call(listMcpApi.default, { auth: switchedRootAuth })
    ]);

    expect(appsRes.code).toBe(200);
    expect(appsRes.data.map((a: any) => String(a._id))).toContain(String(privateApp._id));
    expect(appsRes.data[0].permission.isOwner).toBe(true);

    expect(datasetsRes.code).toBe(200);
    expect(datasetsRes.data.map((d: any) => String(d._id))).toContain(String(privateDataset._id));
    expect(datasetsRes.data[0].permission.isOwner).toBe(true);

    expect(mcpRes.code).toBe(200);
    expect(mcpRes.data.map((m: any) => String(m._id))).toContain(String(tenantMcp._id));

    const [appAuth, datasetAuth, outLinkAuth, mcpAuth] = await Promise.all([
      authApp({
        req: { auth: switchedRootAuth } as any,
        authToken: true,
        appId: String(privateApp._id),
        per: ReadPermissionVal
      }),
      authDataset({
        req: { auth: switchedRootAuth } as any,
        authToken: true,
        datasetId: String(privateDataset._id),
        per: ReadPermissionVal
      }),
      authOutLinkCrud({
        req: { auth: switchedRootAuth } as any,
        authToken: true,
        outLinkId: String(tenantOutLink._id)
      }),
      authMcp({
        req: { auth: switchedRootAuth } as any,
        authToken: true,
        mcpId: String(tenantMcp._id),
        per: ReadPermissionVal
      })
    ]);

    expect(appAuth.permission.isOwner).toBe(true);
    expect(datasetAuth.permission.isOwner).toBe(true);
    expect(outLinkAuth.app.permission.isOwner).toBe(true);
    expect(mcpAuth.permission.isOwner).toBe(true);
  });

  it('rejects non-root users and invalid HTTP methods', async () => {
    const nonRootRes = await Call(switchTeamApi.default, {
      method: 'PUT',
      body: { teamId: String(rootOwnTeam._id) },
      auth: {
        userId: String(tenantUser._id),
        teamId: String(tenantTeam._id),
        tmbId: String(tenantOwnerTmb._id),
        isRoot: false,
        sessionId: 'tenant-session'
      } as any
    });
    expect(nonRootRes.code).toBe(500);
    expect(nonRootRes.error).toBe(ERROR_ENUM.unAuthorization);

    const wrongMethodRes = await Call(switchTeamApi.default, {
      method: 'POST',
      body: { teamId: String(tenantTeam._id) },
      auth: {
        userId: String(rootUser._id),
        teamId: String(rootOwnTeam._id),
        tmbId: String(rootOwnTmb._id),
        isRoot: true,
        sessionId: 'root-session'
      } as any
    });
    expect(wrongMethodRes.code).toBe(500);
    expect(wrongMethodRes.error).toBe(CommonErrEnum.invalidParams);
  });
});
