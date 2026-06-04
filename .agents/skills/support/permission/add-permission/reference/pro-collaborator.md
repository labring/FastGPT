# fastgpt-pro 协作者管理

> fastgpt-pro 在 FastGPT 主仓库的基础权限系统之上，提供"可运营的权限管理能力"。

## 1. 架构分层

```
┌────────────────────────────────────────────────────────────────────┐
│                         fastgpt-pro 权限扩展层                     │
├────────────────────────────────────────────────────────────────────┤
│ API 层                                                             │
│ ├── /api/core/{resource}/collaborator/list                         │
│ ├── /api/core/{resource}/collaborator/update                       │
│ └── /api/core/{resource}/changeOwner                               │
├────────────────────────────────────────────────────────────────────┤
│ 编排层                                                             │
│ ├── updateResourceCollaborators                                    │
│ ├── getChangedCollaborators                                        │
│ ├── checkRoleUpdateConflict                                        │
│ └── mergeCollaboratorList                                          │
├────────────────────────────────────────────────────────────────────┤
│ FastGPT 主仓库基础能力                                             │
│ ├── authDataset / authApp                                          │
│ ├── getTmbPermission                                               │
│ └── ResourcePermission Schema                                      │
└────────────────────────────────────────────────────────────────────┘
```

**一句话概括**：FastGPT 负责"判定权限"，fastgpt-pro 负责"管理权限"。

---

## 2. 协作者列表接口

### 接口设计

```typescript
// fastgpt-pro/projects/app/src/pages/api/core/{resource}/collaborator/list.ts
type Response = {
  clbs: CollaboratorItemDetailType[];       // 最终生效协作者
  parentClbs?: CollaboratorItemDetailType[]; // 父级协作者（用于展示来源）
};
```

### 实现

```typescript
async function handler(req) {
  const { teamId, {resource} } = await auth{Resource}({
    req,
    authToken: true,
    {resource}Id,
    per: ReadPermissionVal
  });

  // 判断是否需要获取父级协作者
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

  // 合并得到最终生效协作者
  const realClbs = isGetParentClbs
    ? mergeCollaboratorList({ childClbs, parentClbs })
    : childClbs;

  return {
    clbs: await getClbsInfo(realClbs),
    parentClbs: await getClbsInfo(parentClbs)
  };
}
```

### 设计意图

- 不是简单返回 `MongoResourcePermission.find({ resourceId })`
- 同时返回"最终权限视图"和"继承来源视图"
- 前端可以据此展示"此权限来自父级"的 UI 提示

---

## 3. 协作者更新接口

### 核心流程

```typescript
async function handler(req) {
  // 1. 鉴权（需要 manage 权限）
  const { teamId, tmbId, permission: myPer, {resource} } = await auth{Resource}({
    req,
    authToken: true,
    {resource}Id,
    per: ManagePermissionVal
  });

  // 2. 获取新旧协作者
  const [parentClbs, oldChildClbs] = await Promise.all([
    getResourceOwnedClbs({ resourceId: parentId }),
    getResourceOwnedClbs({ resourceId: {resource}Id })
  ]);

  const oldRealClbs = isGetParentClbs
    ? mergeCollaboratorList({ childClbs: oldChildClbs, parentClbs })
    : oldChildClbs;

  // 3. 计算变化
  const changedClbs = getChangedCollaborators({
    newRealClbs: collaborators,
    oldRealClbs
  });

  // 4. 权限保护检查
  await checkPermissionProtection(changedClbs, tmbId, myPer);

  // 5. 调用编排器更新
  await updateResourceCollaborators({
    teamId,
    resourceId: {resource}Id,
    resourceType,
    collaborators,
    folderTypeList,
    resource: {resource},
    resourceModel,
    session
  });
}
```

### 权限保护规则

```typescript
// 1. 不能修改自己的权限
if (changedClbs.find((clb) => clb?.tmbId === tmbId)) {
  return Promise.reject(ErrEnum.canNotEditSelfPermission);
}

// 2. 非 owner 不能修改管理员级协作者
if (
  changedClbs.some((clb) =>
    new {Resource}Permission({ role: clb.changedRole }).hasManagePer
  ) &&
  !myPer.isOwner
) {
  return Promise.reject(ErrEnum.unAuth);
}
```

---

## 4. updateResourceCollaborators 编排器

### 核心逻辑

```typescript
export const updateResourceCollaborators = async ({
  teamId,
  resourceId,
  resourceType,
  collaborators,      // 用户想更新成的协作者列表
  folderTypeList,
  resource,
  resourceModel,
  session
}) => {
  // 1. 获取父级和当前协作者
  const [parentClbs, oldChildClbs] = await Promise.all([...]);

  // 2. 计算旧的最终协作者
  const oldRealClbs = isGetParentClbs
    ? mergeCollaboratorList({ childClbs: oldChildClbs, parentClbs })
    : oldChildClbs;

  // 3. 计算变化的协作者
  const changedClbs = getChangedCollaborators({
    newRealClbs: collaborators,
    oldRealClbs
  });

  // 4. 检测继承冲突
  const hasConflict = checkRoleUpdateConflict({
    changedClbs,
    parentClbs
  });

  // 5. 如果是 folder，先同步子树
  if (folderTypeList.includes(resource.type)) {
    await syncChildrenPermission({
      resource,
      collaborators,
      ...
    });
  }

  // 6. 如果处于继承态且有冲突，自动断开继承
  if (resource.inheritPermission && hasConflict) {
    await resourceModel.updateOne(
      { _id: resourceId },
      { inheritPermission: false },
      { session }
    );
  }

  // 7. 更新协作者记录
  if (folderTypeList.includes(resource.type) || hasConflict) {
    // folder 或冲突：整表重建
    await MongoResourcePermission.deleteMany({ resourceId }, { session });
    await MongoResourcePermission.insertMany(collaborators, { session });
  } else {
    // 普通情况：增量更新
    for (const clb of changedClbs) {
      if (clb.action === 'add') {
        await MongoResourcePermission.create([clb], { session });
      } else if (clb.action === 'update') {
        await MongoResourcePermission.updateOne(
          { resourceId, ...clbId },
          { permission: clb.permission },
          { session }
        );
      } else if (clb.action === 'delete') {
        await MongoResourcePermission.deleteOne({ resourceId, ...clbId }, { session });
      }
    }
  }
};
```

---

## 5. 继承冲突检测

### checkRoleUpdateConflict

```typescript
export const checkRoleUpdateConflict = ({
  changedClbs,
  parentClbs
}) => {
  for (const changed of changedClbs) {
    // 找到对应的父协作者
    const parentClb = parentClbs.find(p => sameClb(p, changed));

    if (parentClb) {
      // 如果修改了来自父级的协作者权限，或删除了父级协作者
      if (
        changed.action === 'delete' ||
        changed.permission !== parentClb.permission
      ) {
        return true; // 有冲突
      }
    }
  }
  return false;
};
```

### 冲突即断继承

**设计价值**：
1. 用户不需要先点"取消继承"再改协作者
2. 直接改协作者就自动完成"打断继承"状态迁移
3. 交互从"配置底层机制"变成"编辑最终结果"

---

## 6. 为什么 folder 要"整表重建"

folder 或继承态冲突时，采用"删除全部协作者记录，再插入新列表"。

**原因**：这两类场景里，"当前资源的协作者记录"已经不再只是"子级自定义增量"，而是要转成一份新的"显式完整权限快照"。

```typescript
if (folderTypeList.includes(resource.type) || hasConflict) {
  // 整表重建
  await MongoResourcePermission.deleteMany({ resourceId }, { session });
  await MongoResourcePermission.insertMany(collaborators, { session });
}
```

---

## 7. 支持三类协作者

fastgpt-pro 的协作者管理同时支持：

| 类型 | 字段 | 说明 |
|------|------|------|
| 团队成员 | tmbId | 个人级权限 |
| 成员组 | groupId | 组级权限 |
| 组织 | orgId | 组织级权限 |

新资源接入时，必须同时支持这三类协作者。
