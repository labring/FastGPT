import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../../../../openapi/provider/devapi';
import { openAPIPaths } from '../../../../../../openapi/path';
import { WxLoginResultResponseSchema } from '../../../../../../openapi/support/user/account/login/api';

const captchaPath = '/proApi/support/user/account/captcha/getImgCaptcha';

describe('user account OpenAPI contracts', () => {
  it('registers the image captcha route in the generated Dev API document', () => {
    expect(openAPIPaths[captchaPath]).toBeDefined();
    expect(openAPIDocument.paths?.[captchaPath]).toBeDefined();
    expect(openAPIPaths['/api/support/user/account/captcha/getImgCaptcha']).toBeUndefined();
  });

  it('declares null while the WeChat QR login is waiting for a scan', () => {
    expect(WxLoginResultResponseSchema.parse(null)).toBeNull();
  });
});
