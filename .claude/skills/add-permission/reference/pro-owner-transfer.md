# Owner 转移机制

## 1. 接口入口

```typescript
// fastgpt-pro/projects/app/src/pages/api/core/{resource}/changeOwner.ts
async function handler(req) {
  // 只有 owner 能转移
  const { {resource} } = await auth{Resource}({
    req,
    authToken: true,
    {resource}Id,
    per: OwnerPermissionVal
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

## 2. 通用 changeOwner 实现

```typescript
// fastgpt-pro/projects/app/src/service/core/changeOwner.ts
export const changeOwner = async ({
  changeOwnerType,
  resourceId,
  newOwnerId,
  oldOwnerId,
  teamId
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { resourceModel, folderTypeList, resourceType } = getResourceConfig(changeOwnerType);

    // 1. 查询资源
    const resource = await resourceModel.findById(resourceId);

    // 2. 如果是 folder，获取整个子树
    const allResources = folderTypeList.includes(resource.type)
      ? await getResourceTree(resource, resourceModel, folderTypeList)
      : [resource];

    // 3. 更新资源表的 tmbId
    await updateResourceOwner(allResources, newOwnerId, resourceModel, session);

    // 4. 根资源断开继承
    await resourceModel.updateOne(
      { _id: resourceId },
      { inheritPermission: false },
      { session }
    );

    // 5. 修正权限记录
    await fixPermissionRecords(allResources, oldOwnerId, newOwnerId, resourceType, session);

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
```

---

## 3. 更新资源表 Owner

```typescript
const updateResourceOwner = async (
  allResources,
  newOwnerId,
  resourceModel,
  session
) => {
  // 根资源直接改 owner
  await resourceModel.updateOne(
    { _id: allResources[0]._id },
    { tmbId: newOwnerId },
    { session }
  );

  // 子资源：只改仍属于旧 owner 的
  const childResources = allResources.slice(1);
  const oldOwnerChildren = childResources.filter(
    r => String(r.tmbId) === String(oldOwnerId)
  );

  if (oldOwnerChildren.length > 0) {
    await resourceModel.updateMany(
      { _id: { $in: oldOwnerChildren.map(r => r._id) } },
      { tmbId: newOwnerId },
      { session }
    );
  }
};
```

---

## 4. 权限记录修正策略

```typescript
const fixPermissionRecords = async (
  allResources,
  oldOwnerId,
  newOwnerId,
  resourceType,
  session
) => {
  const resourceIds = allResources.map(r => r._id);

  // 查询涉及的权限记录
  const permissions = await MongoResourcePermission.find({
    resourceType,
    resourceId: { $in: resourceIds },
    tmbId: { $in: [oldOwnerId, newOwnerId] }
  });

  // 按资源分组
  const perByResource = groupBy(permissions, 'resourceId');

  for (const [resourceId, pers] of Object.entries(perByResource)) {
    const oldOwnerPer = pers.find(p => String(p.tmbId) === String(oldOwnerId));
    const newOwnerPer = pers.find(p => String(p.tmbId) === String(newOwnerId));

    if (oldOwnerPer && newOwnerPer) {
      // 情况1：两者都有记录 → 合并后只保留 newOwner
      await MongoResourcePermission.updateOne(
        { _id: newOwnerPer._id },
        { permission: Math.max(oldOwnerPer.permission, newOwnerPer.permission) },
        { session }
      );
      await MongoResourcePermission.deleteOne(
        { _id: oldOwnerPer._id },
        { session }
      );
    } else if (oldOwnerPer && !newOwnerPer) {
      // 情况2：只有 oldOwner 有记录 → 改成 newOwner
      await MongoResourcePermission.updateOne(
        { _id: oldOwnerPer._id },
        { tmbId: newOwnerId },
        { session }
      );
    }
    // 情况3：只有 newOwner 有记录 → 保持不变
  }
};
```

### 注意

当前使用 `Math.max(oldPer, newPer)` 合并权限。这在 bitmask 设计下有潜在风险，因为数值更大不一定代表权限更强。

建议后续改成更明确的合并策略：

```typescript
// 推荐做法
const mergedPermission = oldOwnerPer.permission | newOwnerPer.permission;
```

---

## 5. Folder 子树处理

```typescript
const getResourceTree = async (root, resourceModel, folderTypeList) => {
  const result = [root];
  const queue = [root._id];

  while (queue.length) {
    const parentId = queue.shift();

    const children = await resourceModel.find({
      parentId,
      teamId: root.teamId
    });

    for (const child of children) {
      result.push(child);
      // 只有 folder 才继续递归
      if (folderTypeList.includes(child.type)) {
        queue.push(child._id);
      }
    }
  }

  return result;
};
```

---

## 6. 完整流程图

```
Owner 转移请求
       │
       ▼
┌──────────────────────┐
│ 验证 OwnerPermission │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 查询资源（及子树）    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 更新资源表 tmbId     │
│ (根资源 + 旧owner子) │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 根资源断开继承       │
│ inheritPermission:   │
│ false                │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 修正权限记录         │
│ oldOwner → newOwner  │
└──────────────────────┘
```

---

## 7. 审计日志

Owner 转移是敏感操作，必须记录审计日志：

```typescript
await addOperationLog({
  teamId,
  tmbId,
  operationType: 'changeOwner',
  resourceType,
  resourceId,
  metadata: {
    oldOwnerId,
    newOwnerId,
    resourceName: resource.name
  }
});
```
