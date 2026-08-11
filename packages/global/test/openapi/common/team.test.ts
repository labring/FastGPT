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
});
