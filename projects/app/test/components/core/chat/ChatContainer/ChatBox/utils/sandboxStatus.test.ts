import { describe, expect, it } from 'vitest';
import { getSandboxFailedLabel } from '@/components/core/chat/ChatContainer/ChatBox/utils/sandboxStatus';

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
