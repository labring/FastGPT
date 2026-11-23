import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../../../../openapi/provider/devapi';
import { apiDocOpenAPIDocument } from '../../../../../../openapi/provider/systemopenapi';
import { openAPIPaths } from '../../../../../../openapi/path';
import { WhoamiResponseSchema } from '../../../../../../openapi/support/user/account/whoami/api';
import { ApiKeyTypeEnum } from '../../../../../../support/openapi/constants';
import { AuthUserTypeEnum } from '../../../../../../support/permission/constant';
import { TeamMemberRoleEnum } from '../../../../../../support/user/team/constant';

const whoamiPath = '/support/user/account/whoami';
const objectId = '68ad85a7463006c963799a05';
const objectIdLike = { toString: () => objectId };

const basePermission = {
  isOwner: false,
  hasManagePer: false,
  hasWritePer: true,
  hasReadPer: true,
  hasAppCreatePer: true,
  hasDatasetCreatePer: true,
  hasApikeyCreatePer: false,
  hasSkillCreatePer: false,
  hasModelCreatePer: false
};

describe('whoami OpenAPI contract', () => {
  it('registers GET /support/user/account/whoami in Dev API without exposing it in System OpenAPI', () => {
    expect(openAPIPaths[whoamiPath]?.get).toBeDefined();
    expect(openAPIDocument.paths?.[whoamiPath]?.get?.tags).toEqual(['用户账号', 'API Key 管理']);
    expect(openAPIDocument.paths?.[whoamiPath]?.get?.parameters).toBeUndefined();
    expect(openAPIDocument.paths?.[whoamiPath]?.get?.requestBody).toBeUndefined();
    expect(apiDocOpenAPIDocument.paths?.[whoamiPath]).toBeUndefined();
  });

  it('validates session token responses', () => {
    const parsed = WhoamiResponseSchema.parse({
      authType: AuthUserTypeEnum.token,
      user: {
        userId: objectIdLike,
        username: 'developer@fastgpt.in',
        avatar: '/icon/avatar.svg'
      },
      team: {
        teamId: objectIdLike,
        teamName: '核心研发',
        tmbId: objectIdLike,
        role: TeamMemberRoleEnum.owner,
        permission: {
          ...basePermission,
          isOwner: true,
          hasManagePer: true,
          hasApikeyCreatePer: true,
          hasSkillCreatePer: true,
          hasModelCreatePer: true
        }
      },
      isRoot: false,
      session: {
        createdAt: 1762752000000,
        expiresAt: 1763356800000
      }
    });

    expect(parsed).toMatchObject({
      authType: 'token',
      user: {
        userId: objectId,
        username: 'developer@fastgpt.in',
        avatar: '/icon/avatar.svg'
      },
      team: {
        teamId: objectId,
        tmbId: objectId,
        role: 'owner'
      },
      isRoot: false
    });
  });

  it('validates personal and app API Key responses', () => {
    const personal = WhoamiResponseSchema.parse({
      authType: AuthUserTypeEnum.apikey,
      apiKeyType: ApiKeyTypeEnum.personal,
      user: {
        userId: objectIdLike,
        username: 'developer@fastgpt.in'
      },
      team: {
        teamId: objectIdLike,
        teamName: '核心研发',
        tmbId: objectIdLike,
        role: null,
        permission: basePermission
      },
      apiKey: {
        id: objectIdLike,
        name: 'CI-Key',
        maskedKey: '******1234',
        authProxy: false,
        limit: {
          expiredTime: null,
          maxUsagePoints: -1,
          usagePoints: 42,
          remainingPoints: null
        }
      }
    });

    expect(personal).toMatchObject({
      authType: 'apikey',
      apiKeyType: 'personal',
      apiKey: {
        id: objectId,
        maskedKey: '******1234',
        limit: {
          remainingPoints: null
        }
      }
    });

    const app = WhoamiResponseSchema.parse({
      authType: AuthUserTypeEnum.apikey,
      apiKeyType: ApiKeyTypeEnum.app,
      user: {
        userId: objectIdLike,
        username: 'developer@fastgpt.in'
      },
      team: {
        teamId: objectIdLike,
        teamName: '核心研发',
        tmbId: objectIdLike,
        role: null,
        permission: null
      },
      apiKey: {
        id: objectIdLike,
        name: 'App-Key',
        maskedKey: '******5678',
        boundAppId: objectIdLike,
        boundAppName: '客服助手',
        authProxy: false,
        limit: {
          expiredTime: '2026-12-31T23:59:59.000Z',
          maxUsagePoints: 1000,
          usagePoints: 250,
          remainingPoints: 750
        }
      }
    });

    expect(app).toMatchObject({
      authType: 'apikey',
      apiKeyType: 'app',
      team: {
        permission: null
      },
      apiKey: {
        boundAppId: objectId,
        boundAppName: '客服助手',
        limit: {
          remainingPoints: 750
        }
      }
    });
  });

  it('rejects mismatched authType payloads', () => {
    expect(
      WhoamiResponseSchema.safeParse({
        authType: AuthUserTypeEnum.token,
        user: { userId: objectId, username: 'dev' }
      }).success
    ).toBe(false);

    expect(
      WhoamiResponseSchema.safeParse({
        authType: AuthUserTypeEnum.apikey,
        apiKeyType: 'invalid',
        user: { userId: objectId, username: 'dev' }
      }).success
    ).toBe(false);
  });
});
