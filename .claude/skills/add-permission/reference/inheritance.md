# 继承机制详解

## 1. 继承模型概述

```
┌─────────────────────────────────────────────────────────┐
│  Folder A (inheritPermission: false)                    │
│  协作者: [User1: manage, User2: write]                  │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────────┐         ┌───────────────────────────┐
│ Resource B        │         │ Folder C                  │
│ inherit: true     │         │ inherit: true             │
│ 自身协作者: []    │         │ 协作者: [User1, User2]    │
│                   │         │ (从 A 复制)               │
│ 最终权限:         │         └─────────────┬─────────────┘
│ User1: manage     │                       │
│ User2: write      │                       ▼
│ (来自父级)        │         ┌───────────────────────────┐
└───────────────────┘         │ Resource D                │
                              │ inherit: true             │
                              │ 自身协作者: [User3: read] │
                              │                           │
                              │ 最终权限:                 │
                              │ User1: manage (父级)      │
                              │ User2: write (父级)       │
                              │ User3: read (自身)        │
                              └───────────────────────────┘
```

### 关键规则

1. **Folder 不继承**：folder 的 `inheritPermission` 无效，它有自己的完整协作者列表
2. **普通资源继承**：开启继承时，鉴权时合并父级权限
3. **继承是增量合并**：不是覆盖，子资源可以有额外的显式协作者
4. **父集 owner → 子集 manage**：父资源的 owner 在子资源中降级为 manage（owner 不跨级继承）

---

## 2. 鉴权时的权限合并

```typescript
// packages/service/support/permission/dataset/auth.ts
const isGetParentClb =
  dataset.inheritPermission &&
  dataset.type !== DatasetTypeEnum.folder &&
  !!dataset.parentId;

const [folderPer, myPer] = await Promise.all([
  isGetParentClb
    ? getTmbPermission({ resourceId: dataset.parentId, ... })
    : NullRoleVal,
  getTmbPermission({ resourceId: datasetId, ... })
]);

// 按位合并
const Per = new DatasetPermission({
  role: sumPer(folderPer, myPer),
  isOwner
});
```

### sumPer 实现

```typescript
export const sumPer = (...pers: PermissionValueType[]) => {
  return pers.reduce((acc, per) => acc | per, NullRoleVal);
};
```

---

## 3. 父集 owner → 子集 manage 规则

### 3.1 Folder 创建时复制父协作者

```typescript
// packages/service/support/permission/controller.ts
export const createResourceDefaultCollaborators = async ({
  teamId,
  tmbId,
  resourceId,
  resourceType,
  parentId,
  session
}) => {
  // 1. 获取父协作者
  const parentClbs = parentId
    ? await getResourceOwnedClbs({ teamId, resourceId: parentId, resourceType })
    : [];

  // 2. 构建新协作者列表
  const collaborators = [
    ...parentClbs
      .filter((item) => item.tmbId !== tmbId)  // 排除创建者
      .map((clb) => {
        // 父 owner 降级为 manage
        if (clb.permission === OwnerRoleVal) {
          clb.permission = ManageRoleVal;
        }
        return clb;
      }),
    // 创建者成为 owner
    { tmbId, permission: OwnerRoleVal }
  ];

  // 3. 批量插入
  await MongoResourcePermission.insertMany(
    collaborators.map((clb) => ({
      teamId,
      resourceType,
      resourceId,
      ...clb
    })),
    { session }
  );
};
```

### 3.2 子树权限同步中的 owner 保护

```typescript
// packages/service/support/permission/inheritPermission.ts
for (const latestClb of latestClbList) {
  const latestClbId = getCollaboratorId(latestClb);
  // Skip if child already has owner permission for this collaborator
  if (myOwnerIds.has(latestClbId)) {
    continue;
  }
  const permission =
    latestClb.permission === OwnerRoleVal ? ManageRoleVal : latestClb.permission;
  // ... 插入或更新
}
```

**关键点**：
- 父级 owner 同步到子级时自动转为 manage
- 子级已有 owner 不会被父级覆盖（owner 保护）
- 不同创建者的子 folder 保留各自的 owner 权限

---

## 4. 冲突检测与自动取消继承

### 4.1 冲突规则

```typescript
// packages/global/support/permission/utils.ts
export const checkRoleUpdateConflict = ({
  parentClbs,
  newChildClbs
}: {
  parentClbs: CollaboratorItemType[];
  newChildClbs: CollaboratorItemType[];
}): boolean => {
  // 计算变化的协作者
  const changedClbs = ...;

  for (const changedClb of changedClbs) {
    const parent = parentClbRoleMap.get(getCollaboratorId(changedClb));
    if (!parent) {
      // 新增协作者但父级有协作者列表 → 冲突
      if (parentClbs.length > 0) return true;
      continue;
    }

    const parentRole = parent.permission;
    const childRole = changedClb.permission;

    // Rule 1: Parent is Owner → child must be Manage or Owner
    if (parentRole === OwnerRoleVal) {
      if (!(childRole & ManageRoleVal) || changedClb.deleted) {
        return true;
      }
      continue;
    }

    // Rule 2: Child is Owner → parent must be Write or Manage or Owner
    if (childRole === OwnerRoleVal) {
      if (!parentRole || parentRole === ReadRoleVal) {
        return true;
      }
      continue;
    }

    // Rule 3: Others → any difference is conflict
    if (changedClb.changedRole !== 0 || changedClb.deleted) {
      return true;
    }
  }
  return false;
};
```

### 冲突规则总结

| 场景 | 父级角色 | 子级角色 | 是否冲突 |
|------|----------|----------|----------|
| Rule 1 | Owner | 非 Manage/Owner | 冲突 |
| Rule 2 | Read/Null | Owner | 冲突 |
| Rule 3 | 其他 | 与父级不同 | 冲突 |

### 4.2 冲突时自动取消继承

```typescript
// 协作者更新编排器中的处理
const hasConflict = checkRoleUpdateConflict({
  changedClbs,
  parentClbs
});

// 如果处于继承态且有冲突，自动断开继承
if (resource.inheritPermission && hasConflict) {
  await resourceModel.updateOne(
    { _id: resourceId },
    { inheritPermission: false },
    { session }
  );
}
```

**设计价值**：
1. 用户不需要先点"取消继承"再改协作者
2. 直接改协作者就自动完成"打断继承"状态迁移
3. 交互从"配置底层机制"变成"编辑最终结果"

---

## 5. 权限生效范围 (PermissionEffectScope)

```typescript
// packages/global/support/permission/constant.ts
export enum PermissionEffectScopeEnum {
  allChildren = 'allChildren', // 对所有子级资源生效（默认）
  currentOnly = 'currentOnly' // 仅对当前资源生效
}
```

### 作用

控制权限是否传递到子资源：

| 值 | 说明 |
|----|------|
| `allChildren` | 默认。子资源创建时自动 `inheritPermission: true`，继承父级权限 |
| `currentOnly` | 子资源创建时自动 `inheritPermission: false`，不继承父级权限 |

### 应用场景

```typescript
// Collection 创建时根据父级的 permissionEffectScope 决定 inheritPermission
let inheritPermission = true;
if (parentCollection?.permissionEffectScope === PermissionEffectScopeEnum.currentOnly) {
  inheritPermission = false;
}
```

---

## 6. 子树权限同步 (syncChildrenPermission)

当 folder 的协作者变化时，需要同步到继承它的子树。

```typescript
// packages/service/support/permission/inheritPermission.ts
export async function syncChildrenPermission({
  resource,
  folderTypeList,
  resourceType,
  resourceModel,
  session,
  collaborators: latestClbList,
  additionalFilter = {}
}) {
  // 1. 只处理 folder
  if (!folderTypeList.includes(resource.type)) return;

  // 2. 获取所有 inheritPermission: true 的 folder 子树
  const allFolders = await resourceModel.find({
    teamId: resource.teamId,
    inheritPermission: true,
    type: { $in: folderTypeList },
    ...additionalFilter
  });

  // 3. BFS 遍历子树
  const queue = [resource._id];
  while (queue.length) {
    const parentId = queue.shift();
    const children = allFolders.filter(f => String(f.parentId) === String(parentId));

    for (const child of children) {
      // 获取子资源现有协作者
      const childClbs = await getResourceOwnedClbs({ resourceId: child._id, ... });
      const myOwnerIds = new Set(
        childClbs
          .filter((clb) => clb.permission === OwnerRoleVal)
          .map((clb) => getCollaboratorId(clb))
      );

      for (const latestClb of latestClbList) {
        // 跳过子资源已有 owner 的协作者
        if (myOwnerIds.has(getCollaboratorId(latestClb))) continue;

        const permission =
          latestClb.permission === OwnerRoleVal ? ManageRoleVal : latestClb.permission;

        if (!myClbsIdSet.has(getCollaboratorId(latestClb))) {
          // 新增
          ops.push({ insertOne: { document: { ...permission, ... } } });
        } else {
          // 更新（$set 覆盖，不是增量合并）
          ops.push({ updateOne: { filter: { ... }, update: { $set: { permission } } } });
        }
      }

      // 删除：只删除父级不再存在的非 owner 协作者
      for (const myClb of childClbs) {
        if (myClb.permission === OwnerRoleVal) continue;
        if (!latestClbMap.get(getCollaboratorId(myClb))) {
          ops.push({ deleteOne: { filter: { ... } } });
        }
      }

      queue.push(child._id);
    }
  }

  await MongoResourcePermission.bulkWrite(ops, { session });
}
```

### 关键点

- **owner 保护**：子资源已有 owner 不会被父级覆盖
- **$set 覆盖**：使用 `$set: { permission }` 精确覆盖，不是增量合并
- **只删非 owner**：只删除权限值与父级一致的协作者，保留子资源自有的 owner
- **additionalFilter**：支持额外过滤条件（如 collection 查询时传入 `{ datasetId }`）

---

## 7. 恢复继承 (resumeInheritPermission)

### 7.1 非 Folder 资源

```typescript
// 删除所有自身协作者（保留 owner），设置 inheritPermission: true
await MongoResourcePermission.deleteMany(
  {
    resourceId: resource._id,
    resourceType,
    teamId: resource.teamId,
    permission: { $ne: OwnerRoleVal }
  },
  { session }
);
await resourceModel.updateOne(
  { _id: resource._id },
  { inheritPermission: true },
  { session }
);
```

### 7.2 Folder 资源

```typescript
// 1. 获取父协作者（owner 转 manage）
const collaborators = parentClbs.map((clb) => {
  if (clb.permission === OwnerRoleVal) {
    return { ...clb, permission: ManageRoleVal };
  }
  return { ...clb };
});

// 2. 替换自身协作者（不是合并）
await replaceResourceClbs({
  resourceType,
  teamId: resource.teamId,
  resourceId: resource._id,
  collaborators,
  session
});

// 3. 同步子树
await syncChildrenPermission({
  resource,
  resourceModel,
  folderTypeList,
  resourceType,
  session,
  collaborators
});

// 4. 设置继承标志
await resourceModel.updateOne(
  { _id: resourceId },
  { inheritPermission: true },
  { session }
);
```

---

## 8. replaceResourceClbs - 替换资源协作者

```typescript
// packages/service/support/permission/inheritPermission.ts
export async function replaceResourceClbs({
  resourceType,
  teamId,
  resourceId,
  collaborators,
  session
}) {
  const clbsNow = await MongoResourcePermission.find({ resourceType, teamId, resourceId })
    .lean()
    .session(session);

  // 传入的 owner 自动转为 manage
  const normalizedCollaborators = collaborators.map((clb) =>
    clb.permission === OwnerRoleVal ? { ...clb, permission: ManageRoleVal } : clb
  );

  // 保留现有 owner（不应被修改或删除）
  const ownerIds = new Set(
    clbsNow
      .filter((clb) => clb.permission === OwnerRoleVal)
      .map((clb) => getCollaboratorId(clb))
  );

  // 增量更新：update existing / insert new / delete removed
  // ...（跳过 owner）
}
```

### 特点

- **传入 owner 转 manage**：避免跨资源传播 owner
- **保留现有 owner**：资源自身的创建者权限不被覆盖
- **整表替换**：删除旧列表中不存在的协作者

---

## 9. 资源移动时的处理

```typescript
// 移动资源后
if (newParentId !== oldParentId) {
  // 获取新父级协作者
  const newParentClbs = await getResourceOwnedClbs({
    resourceId: newParentId,
    ...
  });

  // 替换自身协作者
  await replaceResourceClbs({
    resourceType: PerResourceTypeEnum.collection,
    teamId,
    resourceId: String(id),
    collaborators: newParentClbs,
    session
  });

  // 同步子树
  await syncChildrenPermission({
    resource: movedResource,
    folderTypeList,
    resourceType,
    resourceModel,
    session,
    collaborators: newParentClbs
  });
}
```

### 移动时的权限控制

- 移动到 folder collection → 需目标 folder 的 manage 权限
- 从 folder collection 移出 → 需原 folder 的 manage 权限
- 移动到/从 dataset 根级 → 需 dataset 的 manage 权限
