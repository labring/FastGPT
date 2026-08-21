import { describe, expect, it } from 'vitest';
import {
  getSkillPackageKey,
  getSkillPackagePrefix
} from '@fastgpt/service/common/s3/sources/skill';

describe('S3 skill object keys', () => {
  it('encodes raw identifiers exactly once', () => {
    const params = {
      teamId: 'team one',
      skillId: 'skill%20one'
    };

    expect(getSkillPackagePrefix(params)).toBe('agent-skills/team%20one/skill%2520one/');
    expect(
      getSkillPackageKey({
        ...params,
        packageObjectId: 'package%2Fone'
      })
    ).toBe('agent-skills/team%20one/skill%2520one/package%252Fone.zip');
  });
});
