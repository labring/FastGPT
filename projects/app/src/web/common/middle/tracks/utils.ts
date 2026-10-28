import { POST } from '@/web/common/api/request';
import { ClientTrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import type {
  PushTrackBodyType,
  PushTrackDataType
} from '@fastgpt/global/openapi/common/other/api';
import { useSystemStore } from '../../system/useSystemStore';

const createTrack = ({ event, data }: PushTrackBodyType) => {
  if (!useSystemStore.getState()?.feConfigs?.isPlus) return;

  return POST('/common/tracks/push', {
    event,
    data
  });
};

export const webPushTrack = {
  workflowBuilderClick: () => createTrack({ event: ClientTrackEnum.workflowBuilderClick }),
  useAppTemplate: (data: PushTrackDataType<typeof ClientTrackEnum.useAppTemplate>) => {
    return createTrack({
      event: ClientTrackEnum.useAppTemplate,
      data
    });
  },
  readSystemAnnouncement: (
    data: PushTrackDataType<typeof ClientTrackEnum.readSystemAnnouncement>
  ) => {
    return createTrack({
      event: ClientTrackEnum.readSystemAnnouncement,
      data
    });
  },
  clickOperationalAd: (data: PushTrackDataType<typeof ClientTrackEnum.clickOperationalAd>) => {
    return createTrack({
      event: ClientTrackEnum.clickOperationalAd,
      data
    });
  },
  closeOperationalAd: (data: PushTrackDataType<typeof ClientTrackEnum.closeOperationalAd>) => {
    return createTrack({
      event: ClientTrackEnum.closeOperationalAd,
      data
    });
  },
  clientError: (data: PushTrackDataType<typeof ClientTrackEnum.clientError>) => {
    return createTrack({
      event: ClientTrackEnum.clientError,
      data
    });
  },
  workflowDemoMode: (data: PushTrackDataType<typeof ClientTrackEnum.workflowDemoMode>) => {
    return createTrack({
      event: ClientTrackEnum.workflowDemoMode,
      data
    });
  }
};
