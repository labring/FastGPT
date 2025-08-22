import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type AppDetailType } from '@fastgpt/global/core/app/type.d';
import type {
  DingtalkAppType,
  FeishuAppType,
  OutLinkEditType
} from '@fastgpt/global/support/outLink/type.d';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
export const defaultApp: AppDetailType = {
  _id: '',
  name: 'AI',
  type: AppTypeEnum.simple,
  avatar: '/icon/logo.svg',
  intro: '',
  updateTime: new Date(),
  modules: [],
  chatConfig: {},
  teamId: '',
  tmbId: '',
  teamTags: [],
  edges: [],
  version: 'v2',
  permission: new AppPermission(),
  inheritPermission: false
};

export const defaultOutLinkForm: OutLinkEditType = {
  name: '',
  showNodeStatus: true,
  responseDetail: false,
  // showFullText: false,
  showRawSource: false,
  limit: {
    QPM: 100,
    maxUsagePoints: -1
  }
};

export const defaultFeishuOutLinkForm: OutLinkEditType<FeishuAppType> = {
  name: '',
  limit: {
    QPM: 100,
    maxUsagePoints: -1
  }
};

export const defaultDingtalkOutlinkForm: OutLinkEditType<DingtalkAppType> = {
  name: '',
  limit: {
    QPM: 100,
    maxUsagePoints: -1
  }
};

export enum TTSTypeEnum {
  none = 'none',
  web = 'web',
  model = 'model'
}

export const workflowStartNodeId = 'workflowStartNodeId';
