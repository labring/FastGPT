import { describe, expect, it } from 'vitest';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getDeprecatedIndexes } from '@fastgpt/service/common/mongo/schemaIndexes';

describe('TeamMember schema', () => {
  it('does not declare a duplicated WeCom user identity or active index', () => {
    expect(MongoTeamMember.schema.path('wecomUserId')).toBeUndefined();
    expect(MongoTeamMember.schema.indexes()).not.toContainEqual([
      { teamId: 1, wecomUserId: 1 },
      expect.any(Object)
    ]);
  });

  it('registers the removed WeCom index for safe cleanup', () => {
    expect(getDeprecatedIndexes(MongoTeamMember.schema)).toContainEqual({
      indexName: 'teamId_1_wecomUserId_1',
      key: { teamId: 1, wecomUserId: 1 },
      options: {
        unique: true,
        partialFilterExpression: { wecomUserId: { $exists: true } }
      }
    });
  });
});
