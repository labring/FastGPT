import { describe, expect, it } from 'vitest';
import { isSettledSandboxFailure } from '@fastgpt/service/core/ai/sandbox/error';

describe('isSettledSandboxFailure', () => {
  it.each([
    'KUBERNETES::POD_FAILED',
    'sandbox create failed: primary reason=ContainerFailed, message=exit 1',
    'sandbox create failed: primary reason=InitContainerFailed, message=exit 2',
    'container sandbox exited with code 127 (Error)',
    'KUBERNETES::QUOTA_EXCEEDED'
  ])('treats %s as a settled failure', (message) => {
    expect(isSettledSandboxFailure(new Error(message))).toBe(true);
    expect(isSettledSandboxFailure(message)).toBe(true);
  });

  it.each([
    'sandbox request timeout',
    'ECONNRESET',
    'Sandbox lifecycle lease lost',
    'primary reason=Unknown'
  ])('keeps %s in the isolation window', (message) => {
    expect(isSettledSandboxFailure(new Error(message))).toBe(false);
  });

  it('handles empty and non-error input', () => {
    expect(isSettledSandboxFailure(undefined)).toBe(false);
    expect(isSettledSandboxFailure(null)).toBe(false);
    expect(isSettledSandboxFailure({})).toBe(false);
  });
});
