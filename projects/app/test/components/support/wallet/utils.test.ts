import { describe, expect, it } from 'vitest';
import { getPaymentRenderType } from '@/components/support/wallet/utils';

describe('getPaymentRenderType', () => {
  it('uses different render keys for QR code and iframe content', () => {
    expect(getPaymentRenderType({ qrCode: 'weixin://pay' })).toBe('qrCode');
    expect(getPaymentRenderType({ iframeCode: '<form></form>' })).toBe('iframeCode');
  });

  it('keeps the payment content priority stable', () => {
    expect(
      getPaymentRenderType({
        qrCode: 'weixin://pay',
        iframeCode: '<form></form>',
        markdown: 'bank account'
      })
    ).toBe('qrCode');
    expect(getPaymentRenderType({ iframeCode: '<form></form>', markdown: 'bank account' })).toBe(
      'iframeCode'
    );
    expect(getPaymentRenderType({ markdown: 'bank account' })).toBe('markdown');
    expect(getPaymentRenderType({})).toBe('empty');
  });
});
