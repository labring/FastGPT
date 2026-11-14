import { describe, expect, it } from 'vitest';
import { isSkillExportDisabled } from '@fastgpt/global/core/ai/skill/exportAvailability';

describe('skill export availability', () => {
  it('keeps export available for read-only collaborators when the local sandbox state is failed', () => {
    expect(isSkillExportDisabled({ hasWritePer: false, sandboxState: 'failed' })).toBe(false);
  });

  it('keeps export available for read-only collaborators when the sandbox is not started', () => {
    expect(isSkillExportDisabled({ hasWritePer: false, sandboxState: 'idle' })).toBe(false);
  });

  it('requires write users to wait for the edit sandbox to be ready', () => {
    expect(isSkillExportDisabled({ hasWritePer: true, sandboxState: 'loading' })).toBe(true);
    expect(isSkillExportDisabled({ hasWritePer: true, sandboxState: 'failed' })).toBe(true);
    expect(isSkillExportDisabled({ hasWritePer: true, sandboxState: 'ready' })).toBe(false);
  });
});
