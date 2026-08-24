import { describe, expect, expectTypeOf, it } from 'vitest';
import { openAPIDocument } from '../../../openapi/provider/devapi';
import { openAPITagGroups } from '../../../openapi/path';
import { DevApiTagsMap } from '../../../openapi/tag';
import {
  UpdateContactBodySchema,
  UpdateContactResponseSchema,
  UpdateUserAccountBodySchema,
  type UpdateUserAccountBody
} from '../../../openapi/support/user/account/update/api';
import {
  DatasetSizeLimitQuerySchema,
  type DatasetSizeLimitQuery
} from '../../../openapi/support/user/team/limit/api';
import { GetPlansResponseSchema as GetAdminPlansResponseSchema } from '../../../openapi/admin/routes/plans/api';
import {
  GetTeamPlansResponseSchema,
  GetTeamPlanStatusResponseSchema
} from '../../../openapi/support/user/team/api';
import {
  StandardSubLevelEnum,
  SubModeEnum,
  SubTypeEnum
} from '../../../support/wallet/sub/constants';

const normalizedStandardPlan = {
  _id: '68ad85a7463006c963799a05',
  teamId: '68ad85a7463006c963799a06',
  type: SubTypeEnum.standard,
  startTime: new Date('2026-01-01T00:00:00.000Z'),
  expiredTime: new Date('2027-01-01T00:00:00.000Z'),
  currentMode: SubModeEnum.month,
  nextMode: SubModeEnum.month,
  currentSubLevel: StandardSubLevelEnum.basic,
  nextSubLevel: StandardSubLevelEnum.basic,
  totalPoints: 1000,
  surplusPoints: 99.5,
  currentExtraDatasetSize: 0,
  maxTeamMember: 10,
  maxAppAmount: 20,
  maxDatasetAmount: 30,
  maxDatasetSize: 10000,
  chatHistoryStoreDuration: 30
};

describe('common and team OpenAPI contracts', () => {
  it('registers third-party usage and team plan status in their requested groups', () => {
    expect(openAPIDocument.paths?.['/support/user/team/thirtdParty/checkUsage']?.get?.tags).toEqual(
      [DevApiTagsMap.commonOther]
    );
    expect(openAPIDocument.paths?.['/support/user/team/plan/getTeamPlanStatus']?.get?.tags).toEqual(
      [DevApiTagsMap.teamSubscription]
    );
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/plan/getTeamPlans']?.get?.tags
    ).toEqual([DevApiTagsMap.teamSubscription]);
    expect(openAPITagGroups.find(({ name }) => name === '通用-基础功能')?.tags).toContain(
      DevApiTagsMap.commonOther
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-用户体系')?.tags).not.toContain(
      DevApiTagsMap.teamManage
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-用户体系')?.tags).not.toContain(
      DevApiTagsMap.userLimit
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-用户体系')?.tags).not.toContain(
      DevApiTagsMap.enterpriseAuth
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-团队体系')?.tags).toContain(
      DevApiTagsMap.teamManage
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-团队体系')?.tags).toContain(
      DevApiTagsMap.userLimit
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-团队体系')?.tags).toContain(
      DevApiTagsMap.enterpriseAuth
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-团队体系')?.tags).toContain(
      DevApiTagsMap.teamPermission
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-团队体系')?.tags).toContain(
      DevApiTagsMap.teamInvitationLink
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-团队体系')?.tags).toContain(
      DevApiTagsMap.teamMember
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-团队体系')?.tags).toContain(
      DevApiTagsMap.teamSubscription
    );
  });

  it('matches documented methods to current callers', () => {
    expect(openAPIDocument.paths?.['/support/user/account/loginout']?.get).toBeDefined();
    expect(openAPIDocument.paths?.['/support/user/account/loginout']?.post).toBeDefined();
    expect(
      openAPIDocument.paths?.['/proApi/support/user/account/updateContact']?.put
    ).toBeDefined();
    expect(openAPIDocument.paths?.['/support/user/team/update']?.put).toBeDefined();
    expect(openAPIDocument.paths?.['/core/dataset/collection/delete']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/core/chat/inputGuide/delete']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/core/chat/inputGuide/deleteAll']?.post).toBeDefined();
  });

  it('keeps tag names unique across developer API groups', () => {
    const groupedTags = openAPITagGroups.flatMap(({ tags }) => tags);

    expect(new Set(groupedTags).size).toBe(groupedTags.length);
  });

  it('keeps team operation tags unique', () => {
    const duplicateTaggedOperations = Object.entries(openAPIDocument.paths ?? {}).flatMap(
      ([path, pathItem]) =>
        path.includes('/support/user/team/')
          ? Object.entries(pathItem ?? {})
              .map(([method, operation]) => ({
                path,
                method,
                tags: (operation as { tags?: string[] } | undefined)?.tags
              }))
              .filter(({ tags }) => (tags?.length ?? 0) > 1)
          : []
    );

    expect(duplicateTaggedOperations).toEqual([]);
  });

  it('keeps deprecated account fields and coerces numeric query values', () => {
    expect(UpdateUserAccountBodySchema.parse({ balance: 10 })).toEqual({ balance: 10 });
    expect(DatasetSizeLimitQuerySchema.parse({ size: '100' })).toEqual({ size: 100 });

    expectTypeOf<UpdateUserAccountBody['balance']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<DatasetSizeLimitQuery['size']>().toEqualTypeOf<number | undefined>();
    expect(
      UpdateContactBodySchema.parse({ contact: 'user@example.com', verifyCode: '123456' })
    ).toEqual({
      contact: 'user@example.com',
      verifyCode: '123456'
    });
    expect(UpdateContactResponseSchema.parse(undefined)).toBeUndefined();
  });

  it('accepts a normalized plan response with fractional point usage', () => {
    expect(
      GetTeamPlanStatusResponseSchema.parse({
        standard: normalizedStandardPlan,
        totalPoints: 1000,
        usedPoints: 900.5,
        datasetMaxSize: 10000,
        usedMember: 1,
        usedAppAmount: 2,
        usedDatasetSize: 3,
        usedDatasetIndexSize: 4,
        usedRegistrationCount: 5
      })
    ).toMatchObject({ standard: normalizedStandardPlan, usedPoints: 900.5 });
  });

  it('uses null for unlimited plan values in the client response', () => {
    expect(
      GetTeamPlanStatusResponseSchema.parse({
        standard: {
          ...normalizedStandardPlan,
          totalPoints: null,
          surplusPoints: null
        },
        totalPoints: null,
        usedPoints: null,
        datasetMaxSize: null,
        usedMember: 1,
        usedAppAmount: 2,
        usedDatasetSize: 3,
        usedDatasetIndexSize: 4,
        usedRegistrationCount: 5
      })
    ).toMatchObject({
      totalPoints: null,
      usedPoints: null,
      datasetMaxSize: null,
      standard: {
        totalPoints: null,
        surplusPoints: null
      }
    });
  });

  it('accepts nullish limits in historical team subscription records', () => {
    const nullableLimits = {
      maxTeamMember: null,
      maxApp: null,
      maxDataset: null,
      requestsPerMinute: null,
      chatHistoryStoreDuration: null,
      maxDatasetSize: null,
      websiteSyncPerDataset: null,
      appRegistrationCount: null,
      auditLogStoreDuration: null,
      ticketResponseTime: null,
      customDomain: null,
      maxUploadFileSize: null,
      maxUploadFileCount: null
    };
    const plan = {
      _id: normalizedStandardPlan._id,
      teamId: normalizedStandardPlan.teamId,
      type: SubTypeEnum.standard,
      startTime: new Date('2026-01-01T00:00:00.000Z'),
      expiredTime: new Date('2027-01-01T00:00:00.000Z'),
      currentSubLevel: StandardSubLevelEnum.custom,
      totalPoints: 1000,
      surplusPoints: 500,
      ...nullableLimits
    };

    expect(GetTeamPlansResponseSchema.parse([plan])[0]).toMatchObject(nullableLimits);
    expect(
      GetTeamPlansResponseSchema.safeParse([{ ...plan, maxTeamMember: 'unlimited' }]).success
    ).toBe(false);
  });

  it('parses admin plan responses from the shared contract', () => {
    expect(
      GetAdminPlansResponseSchema.parse({
        list: [
          {
            id: normalizedStandardPlan._id,
            teamId: normalizedStandardPlan.teamId,
            type: SubTypeEnum.extraDatasetSize,
            extraDatasetSize: 1024,
            startTime: new Date('2026-01-01T00:00:00.000Z'),
            expiredTime: new Date('2027-01-01T00:00:00.000Z'),
            maxTeamMember: null
          }
        ],
        total: 1
      })
    ).toMatchObject({
      list: [{ type: SubTypeEnum.extraDatasetSize, maxTeamMember: null }],
      total: 1
    });
  });
});
