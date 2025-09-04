import { type PermissionListType, type RoleListType, type RolePerMapType } from '../type';
import { CommonPerList, CommonRoleList, CommonRolePerMap } from '../constant';

// 评估模块权限列表 (沿用通用权限，无特殊权限)
export const EvaluationPerList: PermissionListType = CommonPerList;

// 评估模块角色列表 (沿用通用角色)
export const EvaluationRoleList: RoleListType = {
  ...CommonRoleList
} as const;

// 评估模块角色权限映射 (沿用通用映射)
export const EvaluationRolePerMap: RolePerMapType = CommonRolePerMap;

// 评估模块默认权限值
export const EvaluationDefaultRoleVal = 0;

// 常用权限值导出
export const EvaluationReadPermissionVal = EvaluationPerList.read;
export const EvaluationWritePermissionVal = EvaluationPerList.write;
export const EvaluationManagePermissionVal = EvaluationPerList.manage;
