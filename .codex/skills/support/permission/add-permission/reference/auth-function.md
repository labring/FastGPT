# 鉴权函数实现

## 1. 标准鉴权流程

```
用户请求 (带 Token/ApiKey)
       │
       ▼
┌──────────────────────┐
│ parseHeaderCert      │  解析认证信息
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 查询资源             │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 验证 team 归属       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 判断 isOwner         │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ getTmbPermission     │  获取用户权限
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 构建 Permission 对象  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ checkPer 验证        │
└──────────────────────┘
```

---

## 2. 简单资源鉴权模板

```typescript
// packages/service/support/permission/{resource}/auth.ts
import { AuthModeType, parseHeaderCert } from '../type';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { {Resource}Permission } from '@fastgpt/global/support/permission/{resource}/controller';
import { getTmbPermission } from '../controller';

export const auth{Resource} = async ({
  {resource}Id,
  per,
  ...props
}: AuthModeType & {
  {resource}Id: string;
  per: PermissionValueType;
}) => {
  // 1. 解析认证信息
  const result = await parseHeaderCert(props);
  const { tmbId, teamId } = result;

  // 2. 查询资源
  const resource = await Mongo{Resource}.findById({resource}Id).lean();
  if (!resource) {
    return Promise.reject({Resource}ErrEnum.notExist);
  }

  // 3. 验证 team 归属
  if (String(resource.teamId) !== teamId) {
    return Promise.reject({Resource}ErrEnum.unAuth);
  }

  // 4. 判断 owner
  //    - team owner 视为资源 owner
  //    - 资源创建者是 owner
  const isOwner = result.permission.isOwner || String(resource.tmbId) === String(tmbId);

  // 5. 获取用户权限
  const myPer = await getTmbPermission({
    teamId,
    tmbId,
    resourceId: {resource}Id,
    resourceType: PerResourceTypeEnum.{resource}
  });

  // 6. 构建权限对象并检查
  const Per = new {Resource}Permission({ role: myPer, isOwner });
  if (!Per.checkPer(per)) {
    return Promise.reject({Resource}ErrEnum.unAuth);
  }

  // 7. 返回结果
  return {
    ...result,
    permission: Per,
    {resource}: resource
  };
};
```

---

## 3. 继承型资源鉴权模板

```typescript
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

  const resource = await Mongo{Resource}.findById({resource}Id).lean();
  if (!resource) {
    return Promise.reject({Resource}ErrEnum.notExist);
  }

  if (String(resource.teamId) !== teamId) {
    return Promise.reject({Resource}ErrEnum.unAuth);
  }

  const isOwner = result.permission.isOwner || String(resource.tmbId) === String(tmbId);

  // 关键：判断是否需要合并父级权限
  const isGetParentClb =
    resource.inheritPermission &&           // 开启了继承
    resource.type !== '{resource}Folder' && // folder 不继承
    !!resource.parentId;                    // 有父资源

  // 并行获取
  const [folderPer, myPer] = await Promise.all([
    isGetParentClb
      ? getTmbPermission({
          teamId,
          tmbId,
          resourceId: resource.parentId!,
          resourceType: PerResourceTypeEnum.{resource}
        })
      : NullRoleVal,
    getTmbPermission({
      teamId,
      tmbId,
      resourceId: {resource}Id,
      resourceType: PerResourceTypeEnum.{resource}
    })
  ]);

  // 合并权限
  const Per = new {Resource}Permission({
    role: sumPer(folderPer, myPer),
    isOwner
  });

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

## 4. getTmbPermission 实现

```typescript
// packages/service/support/permission/controller.ts
export const getTmbPermission = async ({
  teamId,
  tmbId,
  resourceId,
  resourceType
}) => {
  // 1. 个人权限优先
  const tmbPer = (
    await MongoResourcePermission.findOne({
      resourceType,
      teamId,
      resourceId,
      tmbId
    }, 'permission').lean()
  )?.permission;

  // 个人权限存在则直接返回（即使是 0）
  if (tmbPer !== undefined) return tmbPer;

  // 2. 获取 group 和 org 权限
  const [groupPers, orgPers] = await Promise.all([
    // 查询用户所属 group 的权限
    getGroupPermissions(...),
    // 查询用户所属 org 的权限
    getOrgPermissions(...)
  ]);

  // 3. 合并返回
  return sumPer(...groupPers, ...orgPers);
};
```

---

## 5. API 使用示例

```typescript
// 读取操作
async function handler(req) {
  const { {resource}, permission } = await auth{Resource}({
    req,
    authToken: true,
    {resource}Id,
    per: ReadPermissionVal
  });
  return { ...{resource}, permission };
}

// 写入操作
async function handler(req) {
  const { {resource}, permission } = await auth{Resource}({
    req,
    authToken: true,
    {resource}Id,
    per: WritePermissionVal
  });
  // 业务逻辑...
}

// 删除操作（要求 owner）
async function handler(req) {
  await auth{Resource}({
    req,
    authToken: true,
    {resource}Id,
    per: OwnerPermissionVal
  });
  // 删除逻辑...
}
```
