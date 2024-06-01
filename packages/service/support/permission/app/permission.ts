import {
  Permission,
  PermissionKeyEnum,
  PermissionList,
  PermissionListType,
  PermissionValueType,
  constructPermission
} from '../resourcePermission/permisson';

export enum AppPermissionKeyEnum {
  ReadLog = 'ReadLog',
  DownloadFile = 'DownloadFile'
}

export const AppPermissionList: PermissionListType = {
  ...PermissionList,
  [AppPermissionKeyEnum.ReadLog]: 0b1000,
  [AppPermissionKeyEnum.DownloadFile]: 0b10000
};

export const AppDefaultPermission = new Permission(); // 0

export const AppReadPermission = new Permission().add(PermissionList[PermissionKeyEnum.Read]); // 4

export const AppWritePermission = new Permission(AppReadPermission.value).add(
  PermissionList[PermissionKeyEnum.Write]
); // 6

export const AppAdminPermission = new Permission(AppWritePermission.value).add(
  PermissionList[PermissionKeyEnum.Manage]
); // 7

export const AppOwnerPermission = constructPermission(
  Object.entries(AppPermissionList).map(([_, value]) => value)
); // 31

type AppPermissionType = {
  name: string;
  description: string;
  value: PermissionValueType;
  type?: 'single' | 'multiple';
};

export const AppPermission = <{ [key: string]: AppPermissionType }>{
  [PermissionKeyEnum.Read]: {
    name: '读权限',
    description: '可使用该应用进行对话',
    value: AppReadPermission.value,
    type: 'single'
  },
  [PermissionKeyEnum.Write]: {
    name: '写权限',
    description: '可查看和编辑应用',
    value: AppWritePermission.value,
    type: 'single'
  },
  [PermissionKeyEnum.Manage]: {
    name: '管理权限',
    description: '写权限基础上，可分配该应用权限',
    value: AppAdminPermission.value,
    type: 'single'
  }
  // WARN: below are not used in this time.
  // [AppPermissionKeyEnum.ReadLog]: {
  //   name: '查看日志',
  //   description: '可查看日志',
  //   value: AppPermissionList[AppPermissionKeyEnum.ReadLog],
  //   type: 'multiple'
  // },
  // [AppPermissionKeyEnum.DownloadFile]: {
  //   name: '下载文件',
  //   description: '可下载文件',
  //   value: AppPermissionList[AppPermissionKeyEnum.DownloadFile],
  //   type: 'multiple'
  // }
};
