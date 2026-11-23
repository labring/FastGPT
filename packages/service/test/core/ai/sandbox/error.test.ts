import { describe, expect, it } from 'vitest';
import {
  getSandboxFailureCode,
  isSettledSandboxFailure,
  isSettledSandboxFailureCode
} from '@fastgpt/service/core/ai/sandbox/error';
import { ConnectionError, SandboxTerminationError } from '@fastgpt-sdk/sandbox-adapter';

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

describe('isSettledSandboxFailure / 结构化终止证据', () => {
  // 真实适配器边界：SDK 的通用 ConnectionError 把 provider 终止原因包在 cause。
  const wrapped = (detail: string, code = 'KUBERNETES::POD_FAILED') =>
    new ConnectionError(
      'Failed to create sandbox',
      'http://opensandbox.local',
      new SandboxTerminationError(code, detail)
    );

  it('沿 cause 链读取结构化终止码', () => {
    const error = wrapped(
      'primary reason=ContainerFailed; container sandbox exited with code 127 (Error)'
    );
    expect(isSettledSandboxFailure(error)).toBe(true);
    expect(getSandboxFailureCode(error)).toBe('KUBERNETES::POD_FAILED');
  });

  it('识别带结构化 code 但无文本特征的终止证据', () => {
    const error = wrapped('provider terminated', 'KUBERNETES::QUOTA_EXCEEDED');
    expect(isSettledSandboxFailure(error)).toBe(true);
    expect(getSandboxFailureCode(error)).toBe('KUBERNETES::QUOTA_EXCEEDED');
  });

  it('读取普通对象 cause 的 { code, message } 形态', () => {
    const error = Object.assign(new Error('wrapper'), {
      cause: { code: 'KUBERNETES::POD_FAILED', message: 'pod failed' }
    });
    expect(isSettledSandboxFailure(error)).toBe(true);
    expect(getSandboxFailureCode(error)).toBe('KUBERNETES::POD_FAILED');
  });

  it('遍历 AggregateError.errors', () => {
    const error = new AggregateError([
      new Error('unrelated'),
      new Error('container sandbox exited with code 1')
    ]);
    expect(isSettledSandboxFailure(error)).toBe(true);
    expect(getSandboxFailureCode(error)).toBe('CONTAINER_EXITED');
  });

  it('cause 只有超时等未知结果时仍不判为 settled', () => {
    const error = new ConnectionError(
      'Failed to create sandbox',
      'http://opensandbox.local',
      new Error('KUBERNETES::POD_READY_TIMEOUT: sandbox did not become ready')
    );
    expect(isSettledSandboxFailure(error)).toBe(false);
    expect(getSandboxFailureCode(error)).toBeUndefined();
  });

  it('无 cause 的网络错误不判为 settled', () => {
    const error = new ConnectionError('Failed to create sandbox', 'http://opensandbox.local');
    expect(isSettledSandboxFailure(error)).toBe(false);
  });

  it('只把已知终止码视为可靠结构化证据', () => {
    expect(isSettledSandboxFailureCode('KUBERNETES::POD_FAILED')).toBe(true);
    expect(isSettledSandboxFailureCode('CONTAINER_EXITED')).toBe(true);
    expect(isSettledSandboxFailureCode('CONNECTION_ERROR')).toBe(false);
    expect(isSettledSandboxFailureCode(undefined)).toBe(false);
  });
});
