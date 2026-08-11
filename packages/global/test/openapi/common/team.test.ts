import { describe, expect, expectTypeOf, it } from 'vitest';
import { openAPIDocument } from '../../../openapi/provider/devapi';
import { openAPITagGroups } from '../../../openapi/path';
import { DevApiTagsMap } from '../../../openapi/tag';
import {
  UpdateUserAccountBodySchema,
  type UpdateUserAccountBody
} from '../../../openapi/support/user/account/update/api';
import {
  DatasetSizeLimitQuerySchema,
  type DatasetSizeLimitQuery
} from '../../../openapi/support/user/team/limit/api';
import { GetTeamPlanStatusResponseSchema } from '../../../openapi/support/user/team/api';
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
      [DevApiTagsMap.teamManage]
    );
    expect(openAPITagGroups.find(({ name }) => name === '通用-基础功能')?.tags).toContain(
      DevApiTagsMap.commonOther
    );
    expect(openAPITagGroups.find(({ name }) => name === '辅助-用户体系')?.tags).toContain(
      DevApiTagsMap.teamManage
    );
  });

  it('matches documented methods to current callers', () => {
    expect(openAPIDocument.paths?.['/support/user/account/loginout']?.get).toBeDefined();
    expect(openAPIDocument.paths?.['/support/user/account/loginout']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/support/user/team/update']?.put).toBeDefined();
    expect(openAPIDocument.paths?.['/core/dataset/collection/delete']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/core/chat/inputGuide/delete']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/core/chat/inputGuide/deleteAll']?.post).toBeDefined();
  });

  it('keeps tag names unique across developer API groups', () => {
    const groupedTags = openAPITagGroups.flatMap(({ tags }) => tags);

    expect(new Set(groupedTags).size).toBe(groupedTags.length);
  });

  it('keeps deprecated account fields and coerces numeric query values', () => {
    expect(UpdateUserAccountBodySchema.parse({ balance: 10 })).toEqual({ balance: 10 });
    expect(DatasetSizeLimitQuerySchema.parse({ size: '100' })).toEqual({ size: 100 });

    expectTypeOf<UpdateUserAccountBody['balance']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<DatasetSizeLimitQuery['size']>().toEqualTypeOf<number | undefined>();
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
});
