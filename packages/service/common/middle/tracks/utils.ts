import { PushTrackCommonType } from '@fastgpt/global/common/middle/tracks/type';
import { TrackModel } from './schema';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { addLog } from '../../system/log';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getAppLatestVersion } from '../../../core/app/version/controller';

const createTrack = ({ event, data }: { event: TrackEnum; data: Record<string, any> }) => {
  if (!global.feConfigs?.isPlus) return;
  addLog.info('Push tracks', {
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
export const pushTrack = {
  login: (data: PushTrackCommonType & { type: `${OAuthEnum}` | 'password' }) => {
    return createTrack({
      event: TrackEnum.login,
      data
    });
  },
  createApp: (data: PushTrackCommonType & { type: AppTypeEnum }) => {
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
  }
};
