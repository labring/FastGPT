import { type PushTrackCommonType } from '@fastgpt/global/common/middle/tracks/type';
import { TrackModel } from './schema';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { addLog } from '../../system/log';
import type { OAuthEnum } from '@fastgpt/global/support/user/constant';
import type { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getAppLatestVersion } from '../../../core/app/version/controller';
import { type ShortUrlParams } from '@fastgpt/global/support/marketing/type';
import { getRedisCache, setRedisCache } from '../../redis/cache';
import { differenceInDays } from 'date-fns';

const createTrack = ({ event, data }: { event: TrackEnum; data: Record<string, any> }) => {
  if (!global.feConfigs?.isPlus) return;
  addLog.debug('Push tracks', {
    event,
    ...data
  });

  const { uid, teamId, tmbId, ...props } = data;

  return TrackModel.create({
    event,
    uid,
    teamId,
    tmbId,
    data: props
  });
};

// Run times
const pushCountTrack = ({
  event,
  key,
  data
}: {
  event: TrackEnum;
  key: string;
  data: Record<string, any>;
}) => {
  if (!global.feConfigs?.isPlus) return;
  addLog.debug('Push tracks', {
    event,
    key
  });

  if (!global.countTrackQueue) {
    global.countTrackQueue = new Map();
  }

  const value = global.countTrackQueue.get(key);
  if (value) {
    global.countTrackQueue.set(key, {
      ...value,
      count: value.count + 1
    });
  } else {
    global.countTrackQueue.set(key, {
      event,
      data,
      count: 1
    });
  }
};

export const pushTrack = {
  login: (data: PushTrackCommonType & { type: `${OAuthEnum}` | 'password' }) => {
    return createTrack({
      event: TrackEnum.login,
      data
    })?.then(() => {
      pushTrack.dailyUserActive({
        uid: data.uid,
        teamId: data.teamId,
        tmbId: data.tmbId
      });
    });
  },
  dailyUserActive: async (data: PushTrackCommonType) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `dailyUserActive:${data.uid}_${today}`;
      const cache = await getRedisCache(key);
      if (cache) return;

      await setRedisCache(key, '1', 24 * 60 * 60);

      return createTrack({
        event: TrackEnum.dailyUserActive,
        data
      });
    } catch (error) {
      addLog.error('Failed to track daily user active:', error);
    }
  },
  createApp: (
    data: PushTrackCommonType &
      ShortUrlParams & {
        type: AppTypeEnum;
        appId: string;
      }
  ) => {
    return createTrack({
      event: TrackEnum.createApp,
      data
    });
  },
  createDataset: (data: PushTrackCommonType & { type: DatasetTypeEnum }) => {
    return createTrack({
      event: TrackEnum.createDataset,
      data
    });
  },
  countAppNodes: async (data: PushTrackCommonType & { appId: string }) => {
    try {
      const { nodes } = await getAppLatestVersion(data.appId);
      const nodeTypeList = nodes.map((node) => ({
        type: node.flowNodeType,
        pluginId: node.pluginId
      }));
      return createTrack({
        event: TrackEnum.appNodes,
        data: {
          ...data,
          nodeTypeList
        }
      });
    } catch (error) {}
  },
  runSystemTool: (
    data: PushTrackCommonType & { toolId: string; result: 1 | 0; usagePoint?: number; msg?: string }
  ) => {
    return createTrack({
      event: TrackEnum.runSystemTool,
      data
    });
  },
  datasetSearch: (data: { teamId: string; datasetIds: string[] }) => {
    if (!data.teamId) return;
    data.datasetIds.forEach((datasetId) => {
      pushCountTrack({
        event: TrackEnum.datasetSearch,
        key: `${TrackEnum.datasetSearch}_${datasetId}`,
        data: {
          teamId: data.teamId,
          datasetId
        }
      });
    });
  },
  teamChatQPM: (data: { teamId: string }) => {
    if (!data.teamId) return;
    pushCountTrack({
      event: TrackEnum.teamChatQPM,
      key: `${TrackEnum.teamChatQPM}_${data.teamId}`,
      data: {
        teamId: data.teamId
      }
    });
  },

  // Admin cron job tracks
  subscriptionDeleted: (data: {
    teamId: string;
    subscriptionType: string;
    totalPoints: number;
    usedPoints: number;
    startTime: Date;
    expiredTime: Date;
  }) => {
    return createTrack({
      event: TrackEnum.subscriptionDeleted,
      data: {
        teamId: data.teamId,
        subscriptionType: data.subscriptionType,
        totalPoints: data.totalPoints,
        usedPoints: data.usedPoints,
        activeDays: differenceInDays(data.expiredTime, data.startTime)
      }
    });
  },
  freeAccountCleanup: (data: { teamId: string; expiredTime: Date }) => {
    return createTrack({
      event: TrackEnum.freeAccountCleanup,
      data: {
        teamId: data.teamId,
        expiredTime: data.expiredTime
      }
    });
  },
  auditLogCleanup: (data: { teamId: string; retentionDays: number }) => {
    return createTrack({
      event: TrackEnum.auditLogCleanup,
      data: {
        teamId: data.teamId,
        retentionDays: data.retentionDays
      }
    });
  },
  chatHistoryCleanup: (data: { teamId: string; retentionDays: number }) => {
    return createTrack({
      event: TrackEnum.chatHistoryCleanup,
      data: {
        teamId: data.teamId,
        retentionDays: data.retentionDays
      }
    });
  }
};
