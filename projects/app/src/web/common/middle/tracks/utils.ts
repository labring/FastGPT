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
  }
};
