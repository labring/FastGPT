import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import {
  getOutLinkBrandUpdate,
  getOutLinkBranding
} from '@fastgpt/service/support/outLink/branding/service';

const getTeamCanHideShareBrand = vi.fn<(teamId: string) => Promise<boolean>>();
const brandingEnv = vi.hoisted(() => ({ enabled: true }));

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    ...actual,
    serviceEnv: {
      ...actual.serviceEnv,
      get SHOW_OUTLINK_BRAND() {
        return brandingEnv.enabled;
      }
    }
  };
});

const teamId = '507f1f77bcf86cd799439011';
const appId = '507f1f77bcf86cd799439012';
const link = (isShowBrand?: boolean) =>
  ({
    _id: '507f1f77bcf86cd799439013',
    teamId,
    appId,
    type: PublishChannelEnum.share,
    ...(isShowBrand !== undefined ? { isShowBrand } : {})
  }) as OutLinkSchemaType;

beforeEach(() => {
  vi.mocked(getTeamCanHideShareBrand).mockReset();
  vi.mocked(getTeamCanHideShareBrand).mockResolvedValue(false);
  brandingEnv.enabled = true;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('getOutLinkBrandUpdate', () => {
  it('preserves omitted values, historical exemptions and unrelated channels', async () => {
    expect(await getOutLinkBrandUpdate({ outLink: link(), getTeamCanHideShareBrand })).toEqual({});
    expect(
      await getOutLinkBrandUpdate({
        outLink: link(true),
        isShowBrand: true,
        getTeamCanHideShareBrand
      })
    ).toEqual({});
    expect(
      await getOutLinkBrandUpdate({
        outLink: { ...link(), type: PublishChannelEnum.feishu },
        isShowBrand: false,
        getTeamCanHideShareBrand
      })
    ).toEqual({});
    expect(getTeamCanHideShareBrand).not.toHaveBeenCalled();
  });
  it('ignores brand submissions while globally disabled', async () => {
    brandingEnv.enabled = false;
    expect(
      await getOutLinkBrandUpdate({
        outLink: link(true),
        isShowBrand: false,
        getTeamCanHideShareBrand
      })
    ).toEqual({});
    expect(getTeamCanHideShareBrand).not.toHaveBeenCalled();
  });
  it('requires current owning-team entitlement to hide and propagates lookup failures', async () => {
    await expect(
      getOutLinkBrandUpdate({ outLink: link(true), isShowBrand: false, getTeamCanHideShareBrand })
    ).rejects.toBe(OutLinkErrEnum.cannotHideBrand);
    expect(getTeamCanHideShareBrand).toHaveBeenCalledWith(teamId);
    vi.mocked(getTeamCanHideShareBrand).mockRejectedValueOnce(new Error('lookup failed'));
    await expect(
      getOutLinkBrandUpdate({ outLink: link(true), isShowBrand: false, getTeamCanHideShareBrand })
    ).rejects.toThrow('lookup failed');
    vi.mocked(getTeamCanHideShareBrand).mockResolvedValue(true);
    expect(
      await getOutLinkBrandUpdate({
        outLink: link(true),
        isShowBrand: false,
        getTeamCanHideShareBrand
      })
    ).toEqual({
      isShowBrand: false
    });
  });
  it('lets a historical link explicitly opt in without a paid entitlement', async () => {
    expect(
      await getOutLinkBrandUpdate({ outLink: link(), isShowBrand: true, getTeamCanHideShareBrand })
    ).toEqual({
      isShowBrand: true
    });
    expect(getTeamCanHideShareBrand).not.toHaveBeenCalled();
  });
});

describe('getOutLinkBranding', () => {
  it('resolves only the supplied link without mutating its saved preference', async () => {
    const outLink = link(false);
    const result = await getOutLinkBranding({ outLink, getTeamCanHideShareBrand });
    expect(getTeamCanHideShareBrand).toHaveBeenCalledTimes(1);
    expect(getTeamCanHideShareBrand).toHaveBeenCalledWith(teamId);
    expect(result).toEqual({ enabled: true, showBrand: true });
    getTeamCanHideShareBrand.mockResolvedValue(true);
    expect(await getOutLinkBranding({ outLink, getTeamCanHideShareBrand })).toEqual({
      enabled: true,
      showBrand: false
    });
    expect(outLink.isShowBrand).toBe(false);
  });
  it('queries each link own team instead of reusing another team entitlement', async () => {
    const anotherTeam = '507f1f77bcf86cd799439014';
    getTeamCanHideShareBrand.mockImplementation(async (id) => id === teamId);
    expect(await getOutLinkBranding({ outLink: link(false), getTeamCanHideShareBrand })).toEqual({
      enabled: true,
      showBrand: false
    });
    expect(
      await getOutLinkBranding({
        outLink: { ...link(false), teamId: anotherTeam },
        getTeamCanHideShareBrand
      })
    ).toEqual({ enabled: true, showBrand: true });
    expect(getTeamCanHideShareBrand).toHaveBeenLastCalledWith(anotherTeam);
  });
  it('keeps the saved hiding preference and rendering state on entitlement lookup errors', async () => {
    vi.mocked(getTeamCanHideShareBrand).mockRejectedValueOnce(new Error('read failed'));
    const stored = link(false);
    const branding = await getOutLinkBranding({
      outLink: stored,
      getTeamCanHideShareBrand
    });
    expect(stored.isShowBrand).toBe(false);
    expect(branding.showBrand).toBe(false);
  });
  it('does not read entitlement when disabled, exempt or non-share', async () => {
    for (const outLink of [link(), link(true)]) {
      await getOutLinkBranding({ outLink, getTeamCanHideShareBrand });
    }
    await getOutLinkBranding({
      outLink: { ...link(false), type: PublishChannelEnum.feishu },
      getTeamCanHideShareBrand
    });
    brandingEnv.enabled = false;
    for (const outLink of [link(false), link(true)]) {
      expect(await getOutLinkBranding({ outLink, getTeamCanHideShareBrand })).toEqual({
        enabled: false,
        showBrand: false
      });
    }
    expect(getTeamCanHideShareBrand).not.toHaveBeenCalled();
  });
});
