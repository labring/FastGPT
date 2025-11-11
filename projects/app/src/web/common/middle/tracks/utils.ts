import { POST } from '@/web/common/api/request';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { useSystemStore } from '../../system/useSystemStore';

const createTrack = ({ event, data }: { event: TrackEnum; data: any }) => {
  if (!useSystemStore.getState()?.feConfigs?.isPlus) return;

  return POST('/common/tracks/push', {
    event,
    data
  });
};

export const webPushTrack = {
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
  viewOperationalAd: (data: { adId: string; adImage?: string }) => {
    return createTrack({
      event: TrackEnum.viewOperationalAd,
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
  }
};
