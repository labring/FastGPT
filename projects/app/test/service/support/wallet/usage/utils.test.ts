import { describe, it, expect } from 'vitest';
import { authType2UsageSource } from '@/service/support/wallet/usage/utils';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

describe('authType2UsageSource', () => {
  it('should return source if provided', () => {
    const result = authType2UsageSource({
      authType: AuthUserTypeEnum.apikey,
      shareId: 'share123',
      source: UsageSourceEnum.api
    });
    expect(result).toBe(UsageSourceEnum.api);
  });

  it('should return shareLink if shareId is provided', () => {
    const result = authType2UsageSource({
      authType: AuthUserTypeEnum.apikey,
      shareId: 'share123'
    });
    expect(result).toBe(UsageSourceEnum.shareLink);
  });

  it('should return api if authType is apikey', () => {
    const result = authType2UsageSource({
      authType: AuthUserTypeEnum.apikey
    });
    expect(result).toBe(UsageSourceEnum.api);
  });

  it('should return fastgpt as default', () => {
    const result = authType2UsageSource({});
    expect(result).toBe(UsageSourceEnum.fastgpt);
  });

  it('should return fastgpt for non-apikey authType', () => {
    const result = authType2UsageSource({
      authType: AuthUserTypeEnum.owner
    });
    expect(result).toBe(UsageSourceEnum.fastgpt);
  });

  it('should prioritize source over shareId and authType', () => {
    const result = authType2UsageSource({
      source: UsageSourceEnum.api,
      shareId: 'share123',
      authType: AuthUserTypeEnum.apikey
    });
    expect(result).toBe(UsageSourceEnum.api);
  });

  it('should prioritize shareId over authType', () => {
    const result = authType2UsageSource({
      shareId: 'share123',
      authType: AuthUserTypeEnum.apikey
    });
    expect(result).toBe(UsageSourceEnum.shareLink);
  });
});
