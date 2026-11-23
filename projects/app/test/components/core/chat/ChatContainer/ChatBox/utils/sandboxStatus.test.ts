import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import {
  getSandboxErrorPatch,
  getSandboxFailedLabel,
  resolveChatItemErrorContent,
  translateSandboxFailedLabel
} from '@/components/core/chat/ChatContainer/ChatBox/utils/sandboxStatus';

/** 只实现测试用到的字面量 key，并记录调用以便断言没有动态 key。 */
const createTranslate = () => {
  const calls: string[] = [];
  const t = ((key: string, values?: { message?: string }) => {
    calls.push(key);
    const dictionary: Record<string, string> = {
      'chat:sandbox_status_failed': '沙箱创建失败',
      'chat:sandbox_status_failed_prepare': '运行环境准备失败',
      'chat:sandbox_status_failed_upgrade': '配置升级失败'
    };
    if (key === 'chat:sandbox_status_failed_prepare_with_message') {
      return `运行环境准备失败：${values?.message ?? ''}`;
    }
    if (key === 'chat:sandbox_status_failed_upgrade_with_message') {
      return `配置升级失败：${values?.message ?? ''}`;
    }
    if (key === 'chat:sandbox_status_failed_with_message') {
      return `沙箱创建失败：${values?.message ?? ''}`;
    }
    return dictionary[key] ?? key;
  }) as unknown as TFunction;
  return { t, calls };
};

describe('getSandboxFailedLabel', () => {
  it('maps prepare failures to the runtime-preparation copy', () => {
    expect(getSandboxFailedLabel('prepare', 'container exited with code 127')).toEqual({
      key: 'sandbox_status_failed_prepare_with_message',
      values: { message: 'container exited with code 127' }
    });
    expect(getSandboxFailedLabel('prepare', undefined)).toEqual({
      key: 'sandbox_status_failed_prepare'
    });
  });

  it('maps upgrade failures to the configuration-upgrade copy', () => {
    expect(getSandboxFailedLabel('upgrade', 'quota exceeded')).toEqual({
      key: 'sandbox_status_failed_upgrade_with_message',
      values: { message: 'quota exceeded' }
    });
    expect(getSandboxFailedLabel('upgrade', undefined)).toEqual({
      key: 'sandbox_status_failed_upgrade'
    });
  });

  it('falls back to the legacy copy for events without step', () => {
    expect(getSandboxFailedLabel(undefined, 'sandbox request timeout')).toEqual({
      key: 'sandbox_status_failed_with_message',
      values: { message: 'sandbox request timeout' }
    });
    expect(getSandboxFailedLabel(undefined, undefined)).toEqual({
      key: 'sandbox_status_failed'
    });
  });

  it('ignores unknown steps and empty messages', () => {
    expect(getSandboxFailedLabel('unknown', '')).toEqual({ key: 'sandbox_status_failed' });
  });
});

describe('translateSandboxFailedLabel', () => {
  it('uses literal i18n keys for every label variant', () => {
    const { t, calls } = createTranslate();
    const labels = [
      { key: 'sandbox_status_failed_prepare' },
      { key: 'sandbox_status_failed_prepare_with_message', values: { message: 'boom' } },
      { key: 'sandbox_status_failed_upgrade' },
      { key: 'sandbox_status_failed_upgrade_with_message', values: { message: 'boom' } },
      { key: 'sandbox_status_failed_with_message', values: { message: 'boom' } },
      { key: 'sandbox_status_failed' }
    ] as const;

    const texts = labels.map((label) => translateSandboxFailedLabel(label, t));

    expect(texts).toEqual([
      '运行环境准备失败',
      '运行环境准备失败：boom',
      '配置升级失败',
      '配置升级失败：boom',
      '沙箱创建失败：boom',
      '沙箱创建失败'
    ]);
    // 全部是静态字面量 key，不存在 chat:sandbox_status_${...} 拼接。
    expect(calls).toEqual([
      'chat:sandbox_status_failed_prepare',
      'chat:sandbox_status_failed_prepare_with_message',
      'chat:sandbox_status_failed_upgrade',
      'chat:sandbox_status_failed_upgrade_with_message',
      'chat:sandbox_status_failed_with_message',
      'chat:sandbox_status_failed'
    ]);
  });
});

describe('getSandboxErrorPatch', () => {
  it('stores step and reason on failed events', () => {
    expect(
      getSandboxErrorPatch({
        phase: 'failed',
        step: 'prepare',
        message: 'container sandbox exited with code 127'
      })
    ).toEqual({
      sandboxError: { step: 'prepare', message: 'container sandbox exited with code 127' }
    });
  });

  it('normalizes unknown step and empty reason', () => {
    expect(getSandboxErrorPatch({ phase: 'failed', step: 'unknown', message: '' })).toEqual({
      sandboxError: { step: undefined, message: undefined }
    });
  });

  it('clears stale sandbox errors once the sandbox recovers', () => {
    expect(getSandboxErrorPatch({ phase: 'ready' })).toEqual({ sandboxError: undefined });
    expect(getSandboxErrorPatch({ phase: 'lazyInit' })).toEqual({ sandboxError: undefined });
  });
});

describe('resolveChatItemErrorContent', () => {
  it('failed SSE → 节点错误覆盖 moduleName → end frame 仍保留环节与原因', () => {
    const { t } = createTranslate();

    // 1. failed SSE 写入的失败上下文。
    const failedPatch = getSandboxErrorPatch({
      phase: 'failed',
      step: 'prepare',
      message:
        'primary reason=ContainerFailed; container sandbox exited with code 127 (pod sample-pod-7f9c)'
    });
    // 2. flowNodeStatus 用节点名覆盖 moduleName，但 sandboxError 仍在 item 上。
    const item = {
      moduleName: 'Agent',
      errorMsg: 'Failed to create sandbox',
      sandboxError: failedPatch.sandboxError
    };
    // 3. end frame 从 responseData 取节点错误并写回 errorMsg（保持通用文案）。
    const errorText = { moduleName: 'Agent', errorText: 'Failed to create sandbox' };

    const content = resolveChatItemErrorContent({
      errorMsg: item.errorMsg,
      errorText,
      moduleName: item.moduleName,
      sandboxError: item.sandboxError,
      logErrorPrefix: '运行错误',
      t
    });

    // 最终卡片：标题是失败环节，正文是 provider 原因，节点名降为次要信息。
    expect(content?.title).toContain('运行环境准备失败');
    expect(content?.message).toContain('ContainerFailed');
    expect(content?.message).toContain('sample-pod-7f9c');
    expect(content?.message).not.toBe('Failed to create sandbox');
    expect(content?.secondary).toBe('Agent');
  });

  it('keeps the legacy node-error card when there is no sandbox context', () => {
    const { t } = createTranslate();

    const content = resolveChatItemErrorContent({
      errorMsg: 'node failed',
      errorText: { moduleName: 'Agent', errorText: 'node failed' },
      moduleName: 'Agent',
      logErrorPrefix: '运行错误',
      t
    });

    expect(content).toEqual({ title: '运行错误 - Agent', message: 'node failed' });
  });

  it('falls back to node error text when the failed event has no reason', () => {
    const { t } = createTranslate();

    const content = resolveChatItemErrorContent({
      errorMsg: 'node failed',
      errorText: { moduleName: 'Agent', errorText: 'node failed' },
      moduleName: 'Agent',
      sandboxError: { step: 'upgrade' },
      logErrorPrefix: '运行错误',
      t
    });

    expect(content?.title).toContain('配置升级失败');
    expect(content?.message).toBe('node failed');
    expect(content?.secondary).toBe('Agent');
  });

  it('returns undefined without any error text', () => {
    const { t } = createTranslate();
    expect(resolveChatItemErrorContent({ logErrorPrefix: '运行错误', t })).toBeUndefined();
  });
});
