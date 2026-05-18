import { describe, expect, it } from 'vitest';
import { buildExtractSkillPackageCommand } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle';

describe('buildExtractSkillPackageCommand', () => {
  it('extracts a package into the outer skill workspace directory', () => {
    const command = buildExtractSkillPackageCommand({
      workDirectory: '/workspace',
      targetDir: '/workspace/Skill1',
      zipFileName: 'package_abc.zip'
    });

    expect(command).toBe(
      "mkdir -p '/workspace/Skill1' && cd '/workspace/Skill1' && unzip -o '../package_abc.zip' && rm '/workspace/package_abc.zip'"
    );
  });
});
