import { describe, expect, it, vi } from 'vitest';
import { puzzleCaptchaFixture } from '@test/datas/captcha';

vi.stubGlobal('React', await import('react'));
vi.mock('@/components/support/user/safe/PuzzleCaptchaModal', () => ({ default: 'puzzle-modal' }));
const api = vi.hoisted(() => ({ getCaptchaPic: vi.fn() }));
vi.mock('@/web/support/user/api', () => ({ getCaptchaPic: api.getCaptchaPic }));
const SendCodeAuthModal = (await import('@/components/support/user/safe/SendCodeAuthModal'))
  .default;

describe('SendCodeAuthModal', () => {
  const props = {
    username: 'a@example.com',
    purpose: 'register' as const,
    onClose: vi.fn(),
    onSending: false,
    onSendCode: vi.fn(async () => undefined)
  };

  it('requires puzzle verification before sending and closes only after sending succeeds', async () => {
    const onSendCode = vi.fn(async () => undefined);
    const onClose = vi.fn();
    const element = SendCodeAuthModal({ ...props, onSendCode, onClose });
    expect(element.type).toBe('puzzle-modal');
    expect(onSendCode).not.toHaveBeenCalled();
    await element.props.onVerified('a'.repeat(64));
    expect(onSendCode).toHaveBeenCalledWith({ username: props.username, captcha: 'a'.repeat(64) });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps failures open for the puzzle component to refresh the consumed challenge', async () => {
    const onClose = vi.fn();
    const element = SendCodeAuthModal({
      ...props,
      onClose,
      onSendCode: vi.fn(async () => {
        throw new Error('send failed');
      })
    });
    await expect(element.props.onVerified('a'.repeat(64))).rejects.toThrow('send failed');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the injected 2FA scope adapter or the ordinary account scope', async () => {
    api.getCaptchaPic.mockResolvedValue(puzzleCaptchaFixture);
    const getCaptchaPic = vi.fn(async () => puzzleCaptchaFixture);
    const injected = SendCodeAuthModal({ ...props, getCaptchaPic });
    expect(await injected.props.getCaptcha()).toBe(puzzleCaptchaFixture);
    expect(getCaptchaPic).toHaveBeenCalledOnce();
    expect(api.getCaptchaPic).not.toHaveBeenCalled();
    const ordinary = SendCodeAuthModal(props);
    await ordinary.props.getCaptcha();
    expect(api.getCaptchaPic).toHaveBeenCalledWith(props.username, props.purpose);
  });
});
