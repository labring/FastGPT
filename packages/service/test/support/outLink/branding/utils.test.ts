import { describe, expect, it } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import {
  getNewOutLinkBrandConfig,
  resolveOutLinkBranding
} from '@fastgpt/service/support/outLink/branding/utils';

describe('resolveOutLinkBranding', () => {
  it.each<[boolean, boolean | undefined, boolean | undefined, boolean]>([
    // 覆盖全局开关、历史豁免、显式偏好及权益的各个分支。
    [false, false, undefined, false],
    [true, undefined, undefined, false],
    [true, false, undefined, false],
    [true, false, false, true],
    [true, false, true, false],
    [true, true, undefined, true]
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
