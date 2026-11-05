import { describe, expect, it } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import {
  getNewOutLinkBrandConfig,
  resolveOutLinkBranding
} from '@fastgpt/service/support/outLink/branding/utils';

describe('resolveOutLinkBranding', () => {
  it.each<[boolean, boolean | undefined, boolean | undefined, boolean]>([
    // 全局关闭时，所有偏好和权益组合都不展示品牌。
    [false, undefined, undefined, false],
    [false, undefined, false, false],
    [false, undefined, true, false],
    [false, false, undefined, false],
    [false, false, false, false],
    [false, false, true, false],
    [false, true, undefined, false],
    [false, true, false, false],
    [false, true, true, false],
    // 历史链接始终豁免；隐藏偏好仅在确认权益失效后恢复展示。
    [true, undefined, undefined, false],
    [true, undefined, false, false],
    [true, undefined, true, false],
    [true, false, undefined, false],
    [true, false, false, true],
    [true, false, true, false],
    // 用户主动展示时，不受隐藏权益影响。
    [true, true, undefined, true],
    [true, true, false, true],
    [true, true, true, true]
  ])(
    'global=%s, stored=%s, entitlement=%s => showBrand=%s',
    (enabled, isShowBrand, canHideShareBrand, expectedShowBrand) => {
      expect(
        resolveOutLinkBranding({
          enabled,
          type: PublishChannelEnum.share,
          isShowBrand,
          canHideShareBrand
        })
      ).toEqual({ enabled, showBrand: expectedShowBrand });
    }
  );
  it('isolates non-share channels even when a record contains a brand value', () => {
    expect(
      resolveOutLinkBranding({
        enabled: true,
        type: PublishChannelEnum.feishu,
        isShowBrand: false,
        canHideShareBrand: false
      })
    ).toEqual({
      enabled: false,
      showBrand: false
    });
  });
});

describe('getNewOutLinkBrandConfig', () => {
  it('initializes only newly created share records while globally enabled', () => {
    expect(getNewOutLinkBrandConfig({ enabled: true, type: PublishChannelEnum.share })).toEqual({
      isShowBrand: true
    });
    expect(getNewOutLinkBrandConfig({ enabled: false, type: PublishChannelEnum.share })).toEqual(
      {}
    );
    expect(getNewOutLinkBrandConfig({ enabled: true, type: PublishChannelEnum.feishu })).toEqual(
      {}
    );
  });
});
