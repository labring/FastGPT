# 完整接入：继承型资源权限

> 适用于**继承型资源**：有 folder 结构、支持 `inheritPermission`、需要协作者管理和 owner 转移。

## 概览

继承型资源需要在两个仓库中实现：

| 仓库 | 职责 |
|------|------|
| FastGPT 主仓库 | 权限定义、鉴权、继承同步 |
| fastgpt-pro | 协作者管理、owner 转移、审计日志 |

---

## Part 1: FastGPT 主仓库

### 1.1 基础权限定义

与[快速入门](./quick-start.md)相同，完成 Step 1-3。

### 1.2 资源 Schema 字段

确保资源 Schema 包含以下字段：

```typescript
const {Resource}Schema = new Schema({
  teamId: { type: Schema.Types.ObjectId, required: true },
  tmbId: { type: Schema.Types.ObjectId, required: true },   // 创建者/owner
  parentId: { type: Schema.Types.ObjectId, default: null }, // 父资源
  type: { type: String },                                   // 区分 folder 和普通资源
  inheritPermission: { type: Boolean, default: true }       // 是否继承父权限
});
```

### 1.3 实现带继承的鉴权函数

```typescript
// packages/service/support/permission/{resource}/auth.ts
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
    resource.inheritPermission &&
    resource.type !== '{resource}Folder' &&  // folder 不继承
    !!resource.parentId;

  // 并行获取父级权限和自身权限
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

### 1.4 Folder 创建时复制父协作者

```typescript
// 创建 folder 时
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';

await createResourceDefaultCollaborators({
  teamId,
  tmbId,
  resourceId: newFolderId,
  resourceType: PerResourceTypeEnum.{resource},
  parentId,
  session
});
```

### 1.5 移动资源时同步子树权限

```typescript
// 资源移动后
import { syncChildrenPermission } from '@fastgpt/service/support/permission/inheritPermission';

await syncChildrenPermission({
  resource: movedResource,
  folderTypeList: ['{resource}Folder'],
  resourceType: PerResourceTypeEnum.{resource},
  resourceModel: Mongo{Resource},
  session,
  collaborators: newParentCollaborators
});
```

### 1.6 恢复继承

```typescript
// 恢复继承时
import { resumeInheritPermission } from '@fastgpt/service/support/permission/inheritPermission';

await resumeInheritPermission({
  resource,
  folderTypeList: ['{resource}Folder'],
  resourceType: PerResourceTypeEnum.{resource},
  resourceModel: Mongo{Resource},
  session
});
```

---

## Part 2: fastgpt-pro

### 2.1 协作者列表接口

```typescript
// fastgpt-pro/projects/app/src/pages/api/core/{resource}/collaborator/list.ts
async function handler(req) {
  const { teamId, {resource} } = await auth{Resource}({
    req,
    authToken: true,
    {resource}Id,
    per: ReadPermissionVal
  });

  const isGetParentClbs =
    !!{resource}.inheritPermission &&
    {resource}.type !== '{resource}Folder' &&
    !!{resource}.parentId;

  const [parentClbs, childClbs] = await Promise.all([
    isGetParentClbs
      ? getResourceOwnedClbs({ teamId, resourceId: {resource}.parentId, resourceType })
      : [],
    getResourceOwnedClbs({ teamId, resourceId: {resource}Id, resourceType })
  ]);

  const realClbs = isGetParentClbs
    ? mergeCollaboratorList({ childClbs, parentClbs })
    : childClbs;

  return {
    clbs: await getClbsInfo(realClbs),       // 最终生效协作者
    parentClbs: await getClbsInfo(parentClbs) // 父级协作者（用于 UI 展示来源）
  };
}
```

### 2.2 协作者更新接口

```typescript
// fastgpt-pro/projects/app/src/pages/api/core/{resource}/collaborator/update.ts
async function handler(req) {
  const { teamId, tmbId, permission: myPer, {resource} } = await auth{Resource}({
    req,
    authToken: true,
    {resource}Id,
    per: ManagePermissionVal
  });

  // 保护规则
  const changedClbs = getChangedCollaborators({ newRealClbs: collaborators, oldRealClbs });

  // 1. 不能修改自己的权限
  if (changedClbs.find((clb) => clb?.tmbId === tmbId)) {
    return Promise.reject({Resource}ErrEnum.canNotEditSelfPermission);
  }

  // 2. 非 owner 不能修改管理员级协作者
  if (
    changedClbs.some((clb) => new {Resource}Permission({ role: clb.changedRole }).hasManagePer) &&
    !myPer.isOwner
  ) {
    return Promise.reject({Resource}ErrEnum.unAuth);
  }

  // 调用通用编排器
  await updateResourceCollaborators({
    teamId,
    resourceId: {resource}Id,
    resourceType: PerResourceTypeEnum.{resource},
    collaborators,
    folderTypeList: ['{resource}Folder'],
    resource: {resource},
    resourceModel: Mongo{Resource},
    session
  });
}
```

### 2.3 Owner 转移接口

```typescript
// fastgpt-pro/projects/app/src/pages/api/core/{resource}/changeOwner.ts
async function handler(req) {
  const { {resource} } = await auth{Resource}({
    req,
    authToken: true,
    {resource}Id,
    per: OwnerPermissionVal  // 只有 owner 能转移
  });

  await changeOwner({
    changeOwnerType: '{resource}',
    resourceId: {resource}._id,
    newOwnerId: newOwnerTmbId,
    oldOwnerId: {resource}.tmbId,
    teamId: {resource}.teamId
  });
}
```

---

## Part 3: 前端

### 3.1 协作者管理组件

复用现有的 `MemberManager` 组件，配置：

```typescript
<MemberManager
  permission={permission}
  onGetCollaboratorList={() => get{Resource}Collaborators({resource}Id)}
  onUpdateCollaborators={(clbs) => update{Resource}Collaborators({resource}Id, clbs)}
  onDelOneCollaborator={(clb) => delete{Resource}Collaborator({resource}Id, clb)}
/>
```

### 3.2 继承态提示

```typescript
{resource.inheritPermission && resource.parentId && (
  <Tag colorScheme="blue">继承自父级</Tag>
)}
```

---

## 完成后检查

使用 [实施清单](../checklist.md) 进行最终检查。

## 深入了解

- [继承机制详解](../reference/inheritance.md)
- [协作者管理编排器](../reference/pro-collaborator.md)
- [Owner 转移机制](../reference/pro-owner-transfer.md)
