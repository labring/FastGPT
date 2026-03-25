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

## 3. Folder 创建时复制父协作者

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

---

## 4. 子树权限同步 (syncChildrenPermission)

当 folder 的协作者变化时，需要同步到继承它的子树。

```typescript
// packages/service/support/permission/inheritPermission.ts
export async function syncChildrenPermission({
  resource,
  folderTypeList,
  resourceType,
  resourceModel,
  session,
  collaborators: latestClbList
}) {
  // 1. 只处理 folder
  if (!folderTypeList.includes(resource.type)) return;

  // 2. 获取所有 inheritPermission: true 的 folder 子树
  const allFolders = await resourceModel.find({
    teamId: resource.teamId,
    inheritPermission: true,
    type: { $in: folderTypeList }
  });

  // 3. BFS 遍历子树
  const queue = [resource._id];
  while (queue.length) {
    const parentId = queue.shift();
    const children = allFolders.filter(f => String(f.parentId) === String(parentId));

    for (const child of children) {
      // 获取子资源现有协作者
      const childClbs = await getResourceOwnedClbs({ resourceId: child._id, ... });

      for (const latestClb of latestClbList) {
        // 跳过 owner
        if (latestClb.permission === OwnerRoleVal) continue;

        const myClb = childClbs.find(c => sameClb(c, latestClb));

        if (myClb) {
          // 已有则合并（增量）
          await MongoResourcePermission.updateOne(
            { _id: myClb._id },
            { permission: sumPer(myClb.permission, latestClb.permission) },
            { session }
          );
        } else {
          // 没有则新增
          await MongoResourcePermission.create([{
            ...latestClb,
            resourceId: child._id,
            resourceType
          }], { session });
        }
      }

      // 删除不再存在的纯继承协作者
      for (const childClb of childClbs) {
        const inLatest = latestClbList.find(c => sameClb(c, childClb));
        if (!inLatest && childClb.permission === parentClb?.permission) {
          // 是纯继承的，删除
          await MongoResourcePermission.deleteOne({ _id: childClb._id }, { session });
        }
      }

      queue.push(child._id);
    }
  }
}
```

### 关键点

- **增量合并**：不是简单覆盖，保留子资源的显式增量
- **只删纯继承**：只删除权限值与父级完全一致的协作者
- **跳过 owner**：owner 不参与继承同步

---

## 5. 恢复继承 (resumeInheritPermission)

```typescript
// packages/service/support/permission/inheritPermission.ts
export const resumeInheritPermission = async ({
  resource,
  folderTypeList,
  resourceType,
  resourceModel,
  session
}) => {
  const { teamId, parentId, _id: resourceId } = resource;

  // 1. 获取父协作者
  const parentClbs = parentId
    ? await getResourceOwnedClbs({ teamId, resourceId: parentId, resourceType })
    : [];

  // 2. 获取自身协作者
  const selfClbs = await getResourceOwnedClbs({ teamId, resourceId, resourceType });

  // 3. 合并协作者
  const mergedClbs = mergeCollaboratorList({
    childClbs: selfClbs,
    parentClbs: parentClbs.map((clb) => {
      // 父 owner 降为 manage
      if (clb.permission === OwnerRoleVal) {
        return { ...clb, permission: ManageRoleVal };
      }
      return clb;
    })
  });

  // 4. 删除旧协作者
  await MongoResourcePermission.deleteMany({
    resourceType,
    resourceId
  }, { session });

  // 5. 插入合并后的协作者
  await MongoResourcePermission.insertMany(
    mergedClbs.map(clb => ({
      teamId,
      resourceType,
      resourceId,
      ...clb
    })),
    { session }
  );

  // 6. 如果是 folder，同步子树
  if (folderTypeList.includes(resource.type)) {
    await syncChildrenPermission({
      resource,
      folderTypeList,
      resourceType,
      resourceModel,
      session,
      collaborators: mergedClbs
    });
  }

  // 7. 设置继承标志
  await resourceModel.updateOne(
    { _id: resourceId },
    { inheritPermission: true },
    { session }
  );
};
```

---

## 6. 资源移动时的处理

```typescript
// 移动资源后
if (newParentId !== oldParentId) {
  // 获取新父级协作者
  const newParentClbs = await getResourceOwnedClbs({
    resourceId: newParentId,
    ...
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
