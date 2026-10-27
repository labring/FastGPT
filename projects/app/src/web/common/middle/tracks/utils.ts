import { POST } from '@/web/common/api/request';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { useSystemStore } from '../../system/useSystemStore';
import type { WorkflowDemoTrackData } from './workflowDemoTrack';
import type { WorkflowBuilderTrackData } from '@fastgpt/global/common/middle/tracks/type';

const createTrack = ({ event, data }: { event: TrackEnum; data: any }) => {
  if (!useSystemStore.getState()?.feConfigs?.isPlus) return;

  return POST('/common/tracks/push', {
    event,
    data
  });
};

export const webPushTrack = {
  /** 辅助生成沿用公共鉴权和版本开关；采集失败不进入业务错误处理。 */
  workflowBuilder: async (data: WorkflowBuilderTrackData) => {
    try {
      await createTrack({ event: TrackEnum.workflowBuilder, data });
    } catch {
      console.warn('[Workflow Builder] Track failed', { appId: data.appId, action: data.action });
    }
  },
  useAppTemplate: (data: { id: string; name: string }) => {
    return createTrack({
      event: TrackEnum.useAppTemplate,
      data
    });
  },
  readSystemAnnouncement: (data: { announcementId: string }) => {
    return createTrack({
      event: TrackEnum.readSystemAnnouncement,
      data
    });
  },
  clickOperationalAd: (data: { adId: string; adLink: string }) => {
    return createTrack({
      event: TrackEnum.clickOperationalAd,
      data
    });
  },
  closeOperationalAd: (data: { adId: string }) => {
    return createTrack({
      event: TrackEnum.closeOperationalAd,
      data
    });
  },
  clientError: (data: { route: string; log: string }) => {
    return createTrack({
      event: TrackEnum.clientError,
      data
    });
  },
  workflowDemoMode: (data: WorkflowDemoTrackData) => {
    return createTrack({
      event: TrackEnum.workflowDemoMode,
      data
    });
  }
};
