import { describe, expect, it } from 'vitest';
import {
  getSkillPackageKey,
  getSkillPackagePrefix,
  isSkillTarZstKey
} from '@fastgpt/service/common/s3/sources/skill';

describe('S3 skill object keys', () => {
  it('encodes raw identifiers exactly once and defaults to .tar.zst', () => {
    const params = {
      teamId: 'team one',
      skillId: 'skill%20one'
    };

    expect(getSkillPackagePrefix(params)).toBe('agent-skills/team%20one/skill%2520one/');
    const tarZstKey = getSkillPackageKey({
      ...params,
      packageObjectId: 'package%2Fone'
    });
    expect(tarZstKey).toBe('agent-skills/team%20one/skill%2520one/package%252Fone.tar.zst');
    expect(isSkillTarZstKey(tarZstKey)).toBe(true);

    const legacyZipKey = getSkillPackageKey({
      ...params,
      packageObjectId: 'package%2Fone',
      extension: 'zip'
    });
    expect(legacyZipKey).toBe('agent-skills/team%20one/skill%2520one/package%252Fone.zip');
    expect(isSkillTarZstKey(legacyZipKey)).toBe(false);
  });
});
