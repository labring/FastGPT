import {
  Permission,
  PermissionList,
  PermissionListType,
  constructPermission
} from '../resourcePermission/permisson';

export enum AppPermissionEnum {
  ReadLog = 'ReadLog',
  DownloadFile = 'DownloadFile'
}

export const AppPermissionList: PermissionListType = {
  ...PermissionList,
  [AppPermissionEnum.ReadLog]: 0b1000,
  [AppPermissionEnum.DownloadFile]: 0b10000
};

export const AppDefaultPermission = new Permission(); // 0

export const AppReadPermission = new Permission().add(PermissionList['Read']); // 4

export const AppWritePermission = new Permission(AppReadPermission.value).add(
  PermissionList['Write']
); // 6

export const AppAdminPermission = new Permission(AppWritePermission.value).add(
  PermissionList['Manage']
); // 7

export const AppOwnerPermission = constructPermission([
  PermissionList['Read'],
  PermissionList['Write'],
  PermissionList['Delete'],
  PermissionList['ReadLog'],
  PermissionList['DownloadFile']
]); // 31
