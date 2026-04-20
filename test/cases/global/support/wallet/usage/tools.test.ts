import { describe, it, expect } from 'vitest';
import {
  formatStorePrice2Read,
  getUsageSourceByAuthType,
  getUsageSourceByPublishChannel
} from '@fastgpt/global/support/wallet/usage/tools';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';

describe('wallet/usage/tools', () => {
  describe('formatStorePrice2Read', () => {
    it('should format price with default multiple', () => {
      const result = formatStorePrice2Read(100000);
      expect(result).toBe(1);
    });

    it('should format price with custom multiple', () => {
      const result = formatStorePrice2Read(100000, 2);
      expect(result).toBe(2);
    });

    it('should handle zero value', () => {
      const result = formatStorePrice2Read(0);
      expect(result).toBe(0);
    });

    it('should handle undefined value', () => {
      const result = formatStorePrice2Read();
      expect(result).toBe(0);
    });

    it('should handle decimal values correctly', () => {
      const result = formatStorePrice2Read(50000);
      expect(result).toBe(0.5);
    });

    it('should handle small values with precision', () => {
      const result = formatStorePrice2Read(1);
      expect(result).toBe(0.00001);
    });

    it('should handle large values', () => {
      const result = formatStorePrice2Read(10000000);
      expect(result).toBe(100);
    });

    it('should handle multiple with decimal', () => {
      const result = formatStorePrice2Read(100000, 0.5);
      expect(result).toBe(0.5);
    });
  });

  describe('getUsageSourceByAuthType', () => {
    it('should return shareLink when shareId is provided', () => {
      const result = getUsageSourceByAuthType({ shareId: 'test-share-id' });
      expect(result).toBe(UsageSourceEnum.shareLink);
    });

    it('should return api when authType is apikey', () => {
      const result = getUsageSourceByAuthType({ authType: AuthUserTypeEnum.apikey });
      expect(result).toBe(UsageSourceEnum.api);
    });

    it('should return fastgpt when no shareId and authType is not apikey', () => {
      const result = getUsageSourceByAuthType({ authType: AuthUserTypeEnum.token });
      expect(result).toBe(UsageSourceEnum.fastgpt);
    });

    it('should return fastgpt when no parameters provided', () => {
      const result = getUsageSourceByAuthType({});
      expect(result).toBe(UsageSourceEnum.fastgpt);
    });

    it('should prioritize shareId over authType', () => {
      const result = getUsageSourceByAuthType({
        shareId: 'test-share-id',
        authType: AuthUserTypeEnum.apikey
      });
      expect(result).toBe(UsageSourceEnum.shareLink);
    });

    it('should handle root authType', () => {
      const result = getUsageSourceByAuthType({ authType: AuthUserTypeEnum.root });
      expect(result).toBe(UsageSourceEnum.fastgpt);
    });

    it('should handle outLink authType', () => {
      const result = getUsageSourceByAuthType({ authType: AuthUserTypeEnum.outLink });
      expect(result).toBe(UsageSourceEnum.fastgpt);
    });

    it('should handle teamDomain authType', () => {
      const result = getUsageSourceByAuthType({ authType: AuthUserTypeEnum.teamDomain });
      expect(result).toBe(UsageSourceEnum.fastgpt);
    });
  });

  describe('getUsageSourceByPublishChannel', () => {
    it('should return share for share channel', () => {
      const result = getUsageSourceByPublishChannel(PublishChannelEnum.share);
      expect(result).toBe(UsageSourceEnum.share);
    });

    it('should return shareLink for iframe channel', () => {
      const result = getUsageSourceByPublishChannel(PublishChannelEnum.iframe);
      expect(result).toBe(UsageSourceEnum.shareLink);
    });

    it('should return api for apikey channel', () => {
      const result = getUsageSourceByPublishChannel(PublishChannelEnum.apikey);
      expect(result).toBe(UsageSourceEnum.api);
    });

    it('should return feishu for feishu channel', () => {
      const result = getUsageSourceByPublishChannel(PublishChannelEnum.feishu);
      expect(result).toBe(UsageSourceEnum.feishu);
    });

    it('should return wecom for wecom channel', () => {
      const result = getUsageSourceByPublishChannel(PublishChannelEnum.wecom);
      expect(result).toBe(UsageSourceEnum.wecom);
    });

    it('should return official_account for officialAccount channel', () => {
      const result = getUsageSourceByPublishChannel(PublishChannelEnum.officialAccount);
      expect(result).toBe(UsageSourceEnum.official_account);
    });

    it('should return dingtalk for dingtalk channel', () => {
      const result = getUsageSourceByPublishChannel(PublishChannelEnum.dingtalk);
      expect(result).toBe(UsageSourceEnum.dingtalk);
    });

    it('should return fastgpt for playground channel', () => {
      const result = getUsageSourceByPublishChannel(PublishChannelEnum.playground);
      expect(result).toBe(UsageSourceEnum.fastgpt);
    });

    it('should return fastgpt for unknown channel', () => {
      const result = getUsageSourceByPublishChannel('unknown' as PublishChannelEnum);
      expect(result).toBe(UsageSourceEnum.fastgpt);
    });
  });
});
