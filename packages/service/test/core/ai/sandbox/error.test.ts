import { describe, expect, it } from 'vitest';
import {
  createSandboxRuntimeUpgradeFailedError,
  isSettledSandboxFailure
} from '@fastgpt/service/core/ai/sandbox/error';
import { ConnectionError, SandboxTerminationError } from '@fastgpt-sdk/sandbox-adapter';

describe('isSettledSandboxFailure / 只消费 SDK 结构化失败契约', () => {
  // 真实适配器边界：SDK 的通用 ConnectionError 把 provider 终止原因包在 cause。
  const wrapped = (detail: string, code = 'KUBERNETES::POD_FAILED') =>
    new ConnectionError(
      'Failed to create sandbox',
      'http://opensandbox.local',
      new SandboxTerminationError(code, detail)
    );

  it('沿 cause 链读取 provider 结构化终止码', () => {
    expect(
      isSettledSandboxFailure(
        wrapped('primary reason=ContainerFailed; container sandbox exited with code 127')
      )
    ).toBe(true);
  });

  it('识别带结构化 code 但无文本特征的终止证据', () => {
    expect(
      isSettledSandboxFailure(wrapped('provider terminated', 'KUBERNETES::QUOTA_EXCEEDED'))
    ).toBe(true);
  });

  it('读取普通对象 cause 的 { code, message } 形态', () => {
    const error = Object.assign(new Error('wrapper'), {
      cause: { code: 'KUBERNETES::POD_FAILED', message: 'pod failed' }
    });
    expect(isSettledSandboxFailure(error)).toBe(true);
  });

  it('不从错误文本反推终止码', () => {
    // 文本里出现终止特征不能当作结构化证据。
    expect(isSettledSandboxFailure(new Error('container sandbox exited with code 127'))).toBe(
      false
    );
    expect(
      isSettledSandboxFailure(new Error('sandbox create failed: primary reason=ContainerFailed'))
    ).toBe(false);
    expect(isSettledSandboxFailure('KUBERNETES::POD_FAILED')).toBe(false);
  });

  it('超时/网络等未知结果保持隔离窗口', () => {
    expect(
      isSettledSandboxFailure(
        new ConnectionError(
          'Failed to create sandbox',
          'http://opensandbox.local',
          new Error('KUBERNETES::POD_READY_TIMEOUT: sandbox did not become ready')
        )
      )
    ).toBe(false);
    expect(
      isSettledSandboxFailure(
        new ConnectionError('Failed to create sandbox', 'http://opensandbox.local')
      )
    ).toBe(false);
  });

  it('handles empty and non-error input', () => {
    expect(isSettledSandboxFailure(undefined)).toBe(false);
    expect(isSettledSandboxFailure(null)).toBe(false);
    expect(isSettledSandboxFailure({})).toBe(false);
  });
});

describe('createSandboxRuntimeUpgradeFailedError', () => {
  it('保留原始 cause 以便上层读取结构化终止原因', () => {
    const cause = new ConnectionError(
      'Failed to create sandbox',
      'http://opensandbox.local',
      new SandboxTerminationError('KUBERNETES::POD_FAILED', 'primary reason=ContainerFailed')
    );
    const error = createSandboxRuntimeUpgradeFailedError(cause);

    expect((error as { cause?: unknown }).cause).toBe(cause);
    expect(isSettledSandboxFailure(error)).toBe(true);
  });
});
