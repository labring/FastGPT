import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '@/pages/api/core/chat/outLink/track';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { TrackModel } from '@fastgpt/service/common/middle/tracks/schema';
import mongoose from '@fastgpt/service/common/mongo';
import { serviceEnv } from '@fastgpt/service/env';
import { getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { assertOutLinkBrandRequestRateLimit } from '@fastgpt/service/common/rateLimit/interface/outLinkBrand';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), entitlement: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/publish/authChat', () => ({
  authOutLink: mocks.auth
}));
vi.mock('@fastgpt/service/support/wallet/sub/service', () => ({
  getTeamCanHideShareBrand: mocks.entitlement
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));

const originalEnabled = serviceEnv.SHOW_OUTLINK_BRAND;
const link = {
  _id: '68ad85a7463006c963799a07',
  teamId: '68ad85a7463006c963799a05',
  appId: '68ad85a7463006c963799a06',
  type: PublishChannelEnum.share,
  isShowBrand: true as boolean | undefined
};
const request = (body: Record<string, unknown> = {}, ip: string | undefined = '192.0.2.1') =>
  handler({
    socket: { remoteAddress: ip },
    body: {
      event: TrackEnum.shareBrandExposure,
      ...(body.event === TrackEnum.shareBrandClick ? {} : { eventId: 'page-exposure-id' }),
      outLinkAuthData: { shareId: 'share', outLinkUid: 'anonymous-visitor' },
      ...body
    }
  } as any);

beforeAll(async () => {
  await TrackModel.createIndexes();
});
beforeEach(async () => {
  vi.clearAllMocks();
  await getRedisRuntime().getCommandConnection().flushdb();
  serviceEnv.SHOW_OUTLINK_BRAND = true;
  global.feConfigs = { isPlus: true } as any;
  mocks.auth.mockResolvedValue({
    appId: link.appId,
    uid: 'anonymous-visitor',
    outLinkConfig: { ...link }
  });
  mocks.entitlement.mockResolvedValue(false);
});
afterEach(() => {
  serviceEnv.SHOW_OUTLINK_BRAND = originalEnabled;
  vi.restoreAllMocks();
});

describe('handler', () => {
  it.each([
    { ip: '192.0.2.1', requestIp: '192.0.2.1' },
    { ip: 'unknown', requestIp: '' }
  ])('rejects excess requests before authentication for IP $ip', async ({ ip, requestIp }) => {
    await Promise.all(
      Array.from({ length: 300 }, () => assertOutLinkBrandRequestRateLimit({ ip }))
    );
    await expect(request({}, requestIp)).rejects.toBe(ERROR_ENUM.tooManyRequest);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(await TrackModel.countDocuments()).toBe(0);
  });
  it('caps concurrent writes despite changing visitor IDs, exposure IDs and event types', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 80 }, (_, index) =>
        request({
          ...(index % 2 === 0
            ? { event: TrackEnum.shareBrandExposure, eventId: `page-${index}` }
            : { event: TrackEnum.shareBrandClick }),
          outLinkAuthData: { shareId: 'share', outLinkUid: `visitor-${index}` }
        })
      )
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(60);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(20);
    expect(rejected.every((result) => result.reason === ERROR_ENUM.tooManyRequest)).toBe(true);
    expect(await TrackModel.countDocuments()).toBe(60);

    await expect(request({ eventId: 'another-ip' }, '192.0.2.2')).resolves.toBeUndefined();
    mocks.auth.mockResolvedValueOnce({
      appId: link.appId,
      outLinkConfig: { ...link, _id: 'another-link' }
    });
    await expect(request({ eventId: 'another-link' })).resolves.toBeUndefined();
    expect(await TrackModel.countDocuments()).toBe(62);
  });
  it('does not authenticate or write when the request rate limit cannot reach Redis', async () => {
    vi.mocked(getRedisRuntime().getCommandConnection().multi).mockImplementationOnce(() => {
      throw new Error('Redis unavailable');
    });
    await expect(request()).rejects.toBe(ERROR_ENUM.tooManyRequest);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(await TrackModel.countDocuments()).toBe(0);
  });
  it('does not write when Redis fails after authentication', async () => {
    mocks.auth.mockImplementationOnce(async () => {
      vi.mocked(getRedisRuntime().getCommandConnection().multi).mockImplementationOnce(() => {
        throw new Error('Redis unavailable');
      });
      return { appId: link.appId, outLinkConfig: { ...link } };
    });
    await expect(request()).rejects.toBe(ERROR_ENUM.tooManyRequest);
    expect(await TrackModel.countDocuments()).toBe(0);
  });
  it.each([TrackEnum.shareBrandExposure, TrackEnum.shareBrandClick])(
    'persists %s before returning without saving the anonymous visitor identity',
    async (event) => {
      expect(await request({ event })).toBeUndefined();
      const stored = await TrackModel.findOne({ event }).lean();
      expect(stored).toMatchObject({
        event,
        teamId: link.teamId,
        createTime: expect.any(Date),
        data: { appId: link.appId, shareId: 'share' }
      });
      expect(stored).not.toHaveProperty('uid');
      expect(stored).not.toHaveProperty('tmbId');
      if (event === TrackEnum.shareBrandExposure) {
        expect(stored?.eventId).toBe('page-exposure-id');
      } else {
        expect(stored).not.toHaveProperty('eventId');
      }
      expect(mocks.auth).toHaveBeenCalledWith(
        expect.objectContaining({ shareId: 'share', outLinkUid: 'anonymous-visitor' })
      );
    }
  );
  it.each([
    { event: TrackEnum.login },
    { event: 'powered_by_exposure' },
    { eventId: undefined },
    { eventId: '' },
    { eventId: 'x'.repeat(65) },
    { eventId: 123 },
    { outLinkAuthData: { shareId: 'share' } },
    { teamId: 'spoofed-team' },
    { data: { appId: 'spoofed-app' } }
  ])('rejects an invalid event, identity or injected fields: %j', async (body) => {
    await expect(request(body)).rejects.toBeDefined();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(await TrackModel.countDocuments()).toBe(0);
  });
  it('does not persist events when link access is denied', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('link access denied'));
    await expect(request()).rejects.toThrow('link access denied');
    expect(await TrackModel.countDocuments()).toBe(0);
  });
  it.each(['edition', 'global'])('does not record when disabled by %s', async (disabledBy) => {
    if (disabledBy === 'edition') global.feConfigs = { isPlus: false } as any;
    if (disabledBy === 'global') serviceEnv.SHOW_OUTLINK_BRAND = false;
    await request();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(await TrackModel.countDocuments()).toBe(0);
  });
  it.each([undefined, false])('ignores brands hidden by preference %s', async (isShowBrand) => {
    mocks.auth.mockResolvedValueOnce({
      appId: link.appId,
      outLinkConfig: { ...link, isShowBrand }
    });
    mocks.entitlement.mockResolvedValue(true);
    await request();
    expect(await TrackModel.countDocuments()).toBe(0);
  });
  it('records the restored brand after the hiding entitlement expires', async () => {
    mocks.auth.mockResolvedValueOnce({
      appId: link.appId,
      outLinkConfig: { ...link, isShowBrand: false }
    });
    await request();
    expect(mocks.entitlement).toHaveBeenCalledWith(link.teamId);
    expect(await TrackModel.countDocuments({ event: TrackEnum.shareBrandExposure })).toBe(1);
  });
  it('returns a write failure instead of reporting success', async () => {
    vi.spyOn(TrackModel, 'create').mockRejectedValueOnce(new Error('database unavailable'));
    await expect(request()).rejects.toThrow('database unavailable');
    expect(await TrackModel.countDocuments()).toBe(0);
  });
  it('persists one exposure when the same request is retried concurrently', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => request()));
    expect(results).toEqual(Array(8).fill(undefined));
    expect(await TrackModel.countDocuments({ event: TrackEnum.shareBrandExposure })).toBe(1);
  });
  it('does not duplicate an exposure when a successful write loses its response', async () => {
    vi.spyOn(TrackModel, 'create').mockImplementationOnce(async (record: any) => {
      await new TrackModel(record).save();
      throw new Error('response lost');
    });
    await expect(request()).rejects.toThrow('response lost');
    await expect(request()).resolves.toBeUndefined();
    expect(await TrackModel.countDocuments({ event: TrackEnum.shareBrandExposure })).toBe(1);
  });
  it('records separate pages and every click independently', async () => {
    await request();
    await request({ eventId: 'another-page-exposure-id' });
    await request({ eventId: 'x'.repeat(64) });
    await request({ event: TrackEnum.shareBrandClick });
    await request({ event: TrackEnum.shareBrandClick });
    expect(await TrackModel.countDocuments({ event: TrackEnum.shareBrandExposure })).toBe(3);
    expect(await TrackModel.countDocuments({ event: TrackEnum.shareBrandClick })).toBe(2);
  });
  it('keeps legacy exposures without event IDs and other events outside the unique constraint', async () => {
    await TrackModel.create([
      { event: TrackEnum.shareBrandExposure },
      { event: TrackEnum.shareBrandExposure },
      { event: TrackEnum.shareBrandClick, eventId: 'page-exposure-id' },
      { event: TrackEnum.shareBrandClick, eventId: 'page-exposure-id' }
    ]);
    await request();
    await request();
    expect(await TrackModel.countDocuments({ event: TrackEnum.shareBrandExposure })).toBe(3);
    expect(await TrackModel.countDocuments({ event: TrackEnum.shareBrandClick })).toBe(2);
  });
  it('still checks link access before accepting a duplicate exposure', async () => {
    await request();
    mocks.auth.mockRejectedValueOnce(new Error('link access denied'));
    await expect(request()).rejects.toThrow('link access denied');
    expect(await TrackModel.countDocuments()).toBe(1);
  });
  it.each([
    new mongoose.mongo.MongoServerError({
      message: 'unrelated unique index',
      code: 11000,
      keyPattern: { _id: 1 }
    }),
    new mongoose.mongo.MongoServerError({
      message: 'write concern failed',
      code: 64,
      keyPattern: { event: 1, eventId: 1 }
    }),
    new mongoose.mongo.MongoServerError({ message: 'duplicate without key pattern', code: 11000 }),
    new Error('database unavailable'),
    null
  ])('preserves failures unrelated to the exposure unique index: %s', async (error) => {
    vi.spyOn(TrackModel, 'create').mockRejectedValueOnce(error);
    await expect(request()).rejects.toBe(error);
    expect(await TrackModel.countDocuments()).toBe(0);
  });
  it('does not swallow duplicate-key errors when writing clicks', async () => {
    const error = new mongoose.mongo.MongoServerError({
      message: 'click write failed',
      code: 11000,
      keyPattern: { event: 1, eventId: 1 }
    });
    vi.spyOn(TrackModel, 'create').mockRejectedValueOnce(error);
    await expect(request({ event: TrackEnum.shareBrandClick })).rejects.toBe(error);
  });
});
