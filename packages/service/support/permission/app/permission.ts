import {
  PermissionList,
  PermissionListType,
  constructPermission
} from '../resourcePermission/permisson';

export const AppPermissionList: PermissionListType = {
  ...PermissionList,
  ReadLog: 0b1000,
  DownloadFile: 0b10000
};

// the default DefaultPermission for App
export const AppDefaultPermission = constructPermission([PermissionList['Read']]);

export const AppCollaboratorPermission = AppDefaultPermission;

export const AppWritePermission = AppCollaboratorPermission.add(PermissionList['Write']);

export const AppAdminPermission = AppWritePermission.add(PermissionList['Manage']);

export const AppOwnerPermission = constructPermission([
  PermissionList['Read'],
  PermissionList['Write'],
  PermissionList['Delete'],
  PermissionList['ReadLog'],
  PermissionList['DownloadFile']
]);
