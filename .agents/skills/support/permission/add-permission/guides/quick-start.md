# 快速入门：5 步完成权限接入

> 适用于**简单资源**：无父子结构、无继承、无 owner 转移需求。

## 前置条件

- 资源已有 `teamId` 和 `tmbId` 字段
- 资源属于某个 team

---

## Step 1: 添加资源类型枚举

```typescript
// packages/global/support/permission/constant.ts
export enum PerResourceTypeEnum {
  // ...existing
  {resource} = '{resource}'  // 例如: agentSkill = 'agentSkill'
}
```

---

## Step 2: 创建权限常量文件

```typescript
// packages/global/support/permission/{resource}/constant.ts
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  CommonRoleList,
  CommonPerKeyEnum,
  CommonRolePerMap,
  CommonPerList,
  NullRoleVal
} from '../constant';

export const {Resource}RoleList = {
  [CommonPerKeyEnum.read]: {
    ...CommonRoleList[CommonPerKeyEnum.read],
    description: i18nT('permission:{resource}.read_desc')
  },
  [CommonPerKeyEnum.write]: {
    ...CommonRoleList[CommonPerKeyEnum.write],
    description: i18nT('permission:{resource}.write_desc')
  },
  [CommonPerKeyEnum.manage]: {
    ...CommonRoleList[CommonPerKeyEnum.manage],
    description: i18nT('permission:{resource}.manage_desc')
  }
};

export const {Resource}RolePerMap = CommonRolePerMap;
export const {Resource}PerList = CommonPerList;
export const {Resource}DefaultRoleVal = NullRoleVal;
```

---

## Step 3: 创建 Permission 类

```typescript
// packages/global/support/permission/{resource}/controller.ts
import { Permission, PerConstructPros } from '../controller';
import {
  {Resource}RoleList,
  {Resource}RolePerMap,
  {Resource}PerList,
  {Resource}DefaultRoleVal
} from './constant';

export class {Resource}Permission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = { role: {Resource}DefaultRoleVal };
    } else if (!props.role) {
      props.role = {Resource}DefaultRoleVal;
    }

    props.roleList = {Resource}RoleList;
    props.rolePerMap = {Resource}RolePerMap;
    props.perList = {Resource}PerList;
    super(props);
  }
}
```

---

## Step 4: 实现鉴权函数

```typescript
// packages/service/support/permission/{resource}/auth.ts
import { AuthModeType } from '../type';
import { parseHeaderCert } from '../../controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { {Resource}Permission } from '@fastgpt/global/support/permission/{resource}/controller';
import { getTmbPermission } from '../controller';
import { Mongo{Resource} } from '@fastgpt/service/core/{resource}/schema';
import { {Resource}ErrEnum } from '@fastgpt/global/common/error/code/{resource}';

export const auth{Resource} = async ({
  {resource}Id,
  per,
  ...props
}: AuthModeType & {
  {resource}Id: string;
  per: PermissionValueType;
}) => {
  const result = await parseHeaderCert(props);
  const { tmbId, teamId } = result;

  // 1. 查询资源
  const resource = await Mongo{Resource}.findById({resource}Id).lean();
  if (!resource) {
    return Promise.reject({Resource}ErrEnum.notExist);
  }

  // 2. 验证 team 归属
  if (String(resource.teamId) !== teamId) {
    return Promise.reject({Resource}ErrEnum.unAuth);
  }

  // 3. 判断 owner
  const isOwner = result.permission.isOwner || String(resource.tmbId) === String(tmbId);

  // 4. 获取权限
  const myPer = await getTmbPermission({
    teamId,
    tmbId,
    resourceId: {resource}Id,
    resourceType: PerResourceTypeEnum.{resource}
  });

  // 5. 构建权限对象并检查
  const Per = new {Resource}Permission({ role: myPer, isOwner });
  if (!Per.checkPer(per)) {
    return Promise.reject({Resource}ErrEnum.unAuth);
  }

  return {
    ...result,
    permission: Per,
    {resource}: resource
  };
};
```

---

## Step 5: 在 API 中使用

```typescript
// 读取操作
const { {resource}, permission } = await auth{Resource}({
  req,
  authToken: true,
  {resource}Id,
  per: ReadPermissionVal
});

// 写入操作
const { {resource}, permission } = await auth{Resource}({
  req,
  authToken: true,
  {resource}Id,
  per: WritePermissionVal
});

// 删除操作（要求 owner）
const { {resource} } = await auth{Resource}({
  req,
  authToken: true,
  {resource}Id,
  per: OwnerPermissionVal
});
```

---

## 完成后检查

- [ ] `PerResourceTypeEnum` 已添加
- [ ] 权限常量文件已创建
- [ ] Permission 类已创建
- [ ] 鉴权函数已实现
- [ ] API 路由已使用鉴权函数

## 下一步

- 需要协作者管理？→ 在 fastgpt-pro 中添加 `collaborator/list` 和 `collaborator/update` 接口
- 需要更多细节？→ [参考文档](../reference/README.md)
