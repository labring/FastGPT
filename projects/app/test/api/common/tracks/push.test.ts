import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/common/tracks/push';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TrackModel } from '@fastgpt/service/common/middle/tracks/schema';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { Call } from '@test/utils/request';
import type { PushTrackBodyType } from '@fastgpt/global/openapi/common/other/api';

vi.unmock('@fastgpt/service/common/middle/tracks/utils');

const clientTracks: PushTrackBodyType[] = [
  { event: TrackEnum.useAppTemplate, data: { id: 'app-1', name: 'Template' } },
  { event: TrackEnum.readSystemAnnouncement, data: { announcementId: 'announcement-1' } },
  {
    event: TrackEnum.clickOperationalAd,
    data: { adId: 'ad-1', adLink: 'https://example.com/ad' }
  },
  { event: TrackEnum.closeOperationalAd, data: { adId: 'ad-1' } },
  { event: TrackEnum.clientError, data: { route: '/dashboard', log: 'Render failed' } },
  {
    event: TrackEnum.workflowDemoMode,
    data: {
      appId: 'app-1',
      sessionId: 'session-1',
      initNodeCount: 0,
      demoSessions: [{ nodeCount: 2, duration: 1000 }]
    }
  }
];
const clientEvents: TrackEnum[] = clientTracks.map(({ event }) => event);
const boundaryClientTracks: PushTrackBodyType[] = [
  {
    event: TrackEnum.useAppTemplate,
    data: { id: 'i'.repeat(128), name: '模'.repeat(200) }
  },
  { event: TrackEnum.readSystemAnnouncement, data: { announcementId: 'i'.repeat(128) } },
  {
    event: TrackEnum.clickOperationalAd,
    data: { adId: 'i'.repeat(128), adLink: `/${'a'.repeat(2047)}` }
  },
  { event: TrackEnum.closeOperationalAd, data: { adId: 'i'.repeat(128) } },
  {
    event: TrackEnum.clientError,
    data: { route: `/${'a'.repeat(2047)}`, log: '错'.repeat(65536) }
  },
  {
    event: TrackEnum.workflowDemoMode,
    data: {
      appId: 'i'.repeat(128),
      sessionId: 'i'.repeat(128),
      initNodeCount: 0,
      demoSessions: Array.from({ length: 1000 }, () => ({ nodeCount: 0, duration: 0 }))
    }
  }
];
const auth = {
  userId: 'user-1',
  teamId: 'team-1',
  tmbId: 'member-1',
  appId: '',
  authType: AuthUserTypeEnum.token,
  sourceName: undefined,
  apikey: '',
  isRoot: false,
  sessionId: 'session-1'
};

describe('client track reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.countTrackQueue = new Map();
    global.feConfigs = { ...global.feConfigs, isPlus: true };
  });

  it('stores every supported client event with the authenticated identity', async () => {
    for (const { event, data } of clientTracks) {
      const response = await Call(handler, { auth, body: { event, data } });

      expect(response.error).toBeUndefined();
      expect(response.code).toBe(200);
      const record = await TrackModel.findOne({ event }).lean();
      expect(record).toMatchObject({
        event,
        teamId: auth.teamId,
        tmbId: auth.tmbId,
        data
      });
      expect(record).not.toHaveProperty('uid');
    }
    expect(await TrackModel.countDocuments()).toBe(clientEvents.length);
  });

  it('rejects server-only and unknown events before authentication or persistence', async () => {
    const rejectedEvents = [
      ...Object.values(TrackEnum).filter(
        (event) => !clientEvents.includes(event) && event !== TrackEnum.workflowBuilderClick
      ),
      'unknownEvent'
    ];
    for (const event of rejectedEvents) {
      const response = await Call(handler, {
        auth,
        body: {
          event,
          data: { appId: 'app-1', chatId: 'chat-1', action: 'apply_succeeded' }
        }
      });

      expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
    }
    expect(authCert).not.toHaveBeenCalled();
    expect(await TrackModel.countDocuments()).toBe(0);
  });

  it('counts clicks with omitted or empty data across teams without storing client identity', async () => {
    const clicks = [
      { teamId: 'team-1', body: { event: TrackEnum.workflowBuilderClick } },
      { teamId: 'team-2', body: { event: TrackEnum.workflowBuilderClick, data: {} } }
    ];
    for (const { teamId, body } of clicks) {
      const response = await Call(handler, {
        auth: { ...auth, teamId },
        body
      });
      expect(response.error).toBeUndefined();
    }
    expect(await TrackModel.countDocuments()).toBe(0);
    expect([...global.countTrackQueue.values()]).toEqual([
      {
        event: 'app.workflow.builder.click',
        count: 2,
        data: { createTime: expect.any(Date) }
      }
    ]);
  });

  it('rejects missing, mismatched and malformed event data before authentication', async () => {
    const invalidBodies = [
      ...clientTracks.flatMap(({ event }) => [{ event }, { event, data: {} }]),
      { event: TrackEnum.workflowBuilderClick, data: null },
      { event: TrackEnum.workflowBuilderClick, data: [] },
      { event: TrackEnum.useAppTemplate, data: { announcementId: 'announcement-1' } },
      { event: TrackEnum.clientError, data: { route: '/dashboard', log: [] } },
      ...[-1, 1.5, 'invalid'].map((duration) => ({
        event: TrackEnum.workflowDemoMode,
        data: {
          appId: 'app-1',
          sessionId: 'session-1',
          initNodeCount: 0,
          demoSessions: [{ nodeCount: 1, duration }]
        }
      }))
    ];
    for (const body of invalidBodies) {
      const response = await Call(handler, { auth, body });
      expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
    }
    expect(authCert).not.toHaveBeenCalled();
    expect(await TrackModel.countDocuments()).toBe(0);
    expect(global.countTrackQueue.size).toBe(0);
  });

  it('rejects undeclared data fields for every event and nested demo sessions', async () => {
    const invalidBodies = [
      ...[...clientTracks, { event: TrackEnum.workflowBuilderClick, data: {} }].map(
        ({ event, data }) => ({ event, data: { ...data, teamId: 'forged-team', count: 1000 } })
      ),
      {
        event: TrackEnum.workflowDemoMode,
        data: {
          appId: 'app-1',
          sessionId: 'session-1',
          initNodeCount: 0,
          demoSessions: [{ nodeCount: 1, duration: 0, reason: 'private' }]
        }
      }
    ];
    for (const body of invalidBodies) {
      const response = await Call(handler, { auth, body });
      expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
    }
    expect(authCert).not.toHaveBeenCalled();
    expect(await TrackModel.countDocuments()).toBe(0);
    expect(global.countTrackQueue.size).toBe(0);
  });

  it('normalizes numeric strings in demo sessions before persistence', async () => {
    const response = await Call(handler, {
      auth,
      body: {
        event: TrackEnum.workflowDemoMode,
        data: {
          appId: 'app-1',
          sessionId: 'session-1',
          initNodeCount: '0',
          demoSessions: [{ nodeCount: '2', duration: '0' }]
        }
      }
    });

    expect(response.error).toBeUndefined();
    expect(await TrackModel.findOne({ event: TrackEnum.workflowDemoMode }).lean()).toMatchObject({
      data: {
        appId: 'app-1',
        sessionId: 'session-1',
        initNodeCount: 0,
        demoSessions: [{ nodeCount: 2, duration: 0 }]
      }
    });
  });

  it('accepts upper string and array boundaries, including relative ad links', async () => {
    for (const body of boundaryClientTracks) {
      const response = await Call(handler, { auth, body });

      expect(response.error).toBeUndefined();
      expect(await TrackModel.findOne({ event: body.event }).lean()).toMatchObject({
        data: body.data
      });
    }
  });

  it('rejects empty strings and oversized event data before authentication or persistence', async () => {
    for (const { event, data } of boundaryClientTracks) {
      for (const [field, value] of Object.entries(data)) {
        if (typeof value !== 'string') continue;
        for (const invalidValue of ['', `${value}x`]) {
          const response = await Call(handler, {
            auth,
            body: { event, data: { ...data, [field]: invalidValue } }
          });
          expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
        }
      }
    }

    const response = await Call(handler, {
      auth,
      body: {
        event: TrackEnum.workflowDemoMode,
        data: {
          appId: 'app-1',
          sessionId: 'session-1',
          initNodeCount: 0,
          demoSessions: Array.from({ length: 1001 }, () => ({ nodeCount: 0, duration: 0 }))
        }
      }
    });
    expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
    expect(authCert).not.toHaveBeenCalled();
    expect(await TrackModel.countDocuments()).toBe(0);
    expect(global.countTrackQueue.size).toBe(0);
  });

  it('requires authentication for supported client events', async () => {
    const response = await Call(handler, {
      body: { event: TrackEnum.clientError, data: { route: '/dashboard', log: 'Render failed' } }
    });

    expect(response.error).toBeDefined();
    expect(authCert).toHaveBeenCalledOnce();
    expect(await TrackModel.countDocuments()).toBe(0);
  });

  it('skips reporting outside the Plus edition', async () => {
    global.feConfigs = { ...global.feConfigs, isPlus: false };
    const response = await Call(handler, {
      auth,
      body: { event: TrackEnum.clientError, data: { route: '/dashboard', log: 'Render failed' } }
    });

    expect(response.error).toBeUndefined();
    expect(authCert).not.toHaveBeenCalled();
    expect(await TrackModel.countDocuments()).toBe(0);
  });
});
