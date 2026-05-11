# Dataset Collection 权限管理

> Collection（文件集合）是 Dataset 下的独立资源，支持独立的协作者权限管理和继承机制。

---

## 1. Collection 权限模型概述

### 1.1 资源类型

```typescript
// packages/global/support/permission/constant.ts
export enum PerResourceTypeEnum {
  team = 'team',
  app = 'app',
  dataset = 'dataset',
  collection = 'collection',  // 新增
  // ...
}
```

Collection 作为独立资源类型，拥有独立的 `resource_permissions` 记录，不再直接复用 dataset 的权限。

### 1.2 权限层级结构

```
Dataset (dataset)
    │
    ├─ Folder Collection (collection)
    │       │
    │       ├─ File Collection (collection)
    │       │       └─ Child Collection (collection)
    │       └─ File Collection (collection)
    │
    └─ File Collection (collection)
```

- **Dataset**：顶层资源，管理根级 folder collection
- **Folder Collection**：可包含子 collection，独立管理权限
- **File Collection**：叶子节点，可继承或独立管理权限

---

## 2. Collection 鉴权流程

### 2.1 入口函数

```typescript
// packages/service/support/permission/dataset/auth.ts
export async function authDatasetCollection({
  collectionId,
  per,
  ...props
}) {
  // 1. 解析认证信息
  const { userId, teamId, tmbId, isRoot } = await parseHeaderCert(props);

  // 2. 查询 collection
  const collection = await MongoDatasetCollection.findById(collectionId).lean();
  if (!collection) {
    return Promise.reject(DatasetErrEnum.unExist);
  }

  // root 直接通过
  if (isRoot) {
    return {
      userId, teamId, tmbId, collection,
      permission: new DatasetPermission({ isOwner: true }),
      isRoot: true
    };
  }

  // 3. 计算有效权限（递归向上）
  const permission = await getCollectionTmbPermission({ collection, teamId, tmbId });

  if (!permission.checkPer(per)) {
    return Promise.reject(DatasetErrEnum.unAuthDataset);
  }

  return { userId, teamId, tmbId, collection, permission, isRoot };
}
```

### 2.2 递归权限计算

```typescript
// packages/service/support/permission/dataset/auth.ts
export async function getCollectionTmbPermission({
  collection,
  teamId,
  tmbId,
  depth = 0
}) {
  // 防止无限递归
  if (depth > MAX_COLLECTION_PERMISSION_DEPTH) {
    return new DatasetPermission({ role: NullRoleVal });
  }

  // 检查是否是 collection 的 owner
  const isOwner = tmbPer.isOwner || String(collection.tmbId) === String(tmbId);
  if (isOwner) {
    return new DatasetPermission({ isOwner: true });
  }

  // Folder collection 始终使用独立权限
  const hasIndependentPermission =
    collection.inheritPermission === false ||
    collection.type === DatasetCollectionTypeEnum.folder;

  if (hasIndependentPermission) {
    const myPer = await getTmbPermission({
      teamId, tmbId,
      resourceId: collection._id,
      resourceType: PerResourceTypeEnum.collection
    });
    return new DatasetPermission({ role: myPer ?? NullRoleVal });
  }

  // 继承模式：从父级获取权限
  let parentRoleVal = NullRoleVal;

  if (collection.parentId) {
    // 父级是另一个 collection
    const parentCollection = await MongoDatasetCollection.findOne(
      { _id: collection.parentId },
      '_id tmbId datasetId parentId inheritPermission type'
    ).lean();

    if (parentCollection) {
      const parentPermission = await getCollectionTmbPermission({
        collection: parentCollection, teamId, tmbId, depth: depth + 1
      });
      parentRoleVal = parentPermission.role;
    }
  } else {
    // 父级是 dataset
    const { dataset } = await authDatasetByTmbId({
      tmbId, datasetId: collection.datasetId, per: NullPermissionVal
    });
    parentRoleVal = dataset.permission.role;
  }

  // 按位合并父级权限和自身权限
  const myPer = await getTmbPermission({
    teamId, tmbId,
    resourceId: collection._id,
    resourceType: PerResourceTypeEnum.collection
  }) ?? NullRoleVal;

  return new DatasetPermission({ role: sumPer(parentRoleVal, myPer) });
}
```

### 2.3 递归路径示例

```
File Collection C (inheritPermission: true)
    │
    ├─ parentId → Folder Collection B
    │       │
    │       ├─ parentId → Folder Collection A
    │       │       │
    │       │       └─ parentId → null → Dataset D
    │       │
    │       └─ 独立权限: [User1: manage]
    │
    └─ 自身权限: [User2: read]

User1 的有效权限: manage (来自 B)
User2 的有效权限: read (自身) + manage (来自 B 的继承链) = manage
```

---

## 3. 独立权限 vs 继承权限

### 3.1 独立权限

条件：`inheritPermission === false` 或 `type === folder`

- 只读取 `resource_permissions` 中 `resourceType = collection` 的记录
- folder collection 始终独立管理权限（类似 dataset folder）

### 3.2 继承权限

条件：`inheritPermission === true`（默认）且非 folder

- 设计上，继承的非 folder collection 不应有直接协作者
- 有效权限 = 父级权限 | 自身权限（按位或）
- 父级可以是另一个 collection 或 dataset

---

## 4. Folder Collection 的特殊性

### 4.1 创建时复制父级协作者

```typescript
// packages/service/core/dataset/collection/controller.ts
if (inheritPermission && props.type === DatasetCollectionTypeEnum.folder) {
  // 获取父级协作者
  const parentClbs = await getResourceOwnedClbs({
    resourceId: parentId || datasetId,
    resourceType: parentId ? PerResourceTypeEnum.collection : PerResourceTypeEnum.dataset,
    teamId,
    session
  });

  // 父 owner 降级为 manage，创建者设为 owner
  const collaborators = [
    ...parentClbs
      .filter((clb) => clb.tmbId !== props.tmbId)
      .map((clb) => {
        if (clb.permission === OwnerRoleVal) clb.permission = ManageRoleVal;
        return clb;
      }),
    { tmbId: props.tmbId, permission: OwnerRoleVal }
  ];

  // 批量写入
  await MongoResourcePermission.bulkWrite(ops, { session });
}
```

### 4.2 权限变更同步子树

Folder collection 的协作者变更后，需要同步到所有继承它的子 collection：

```typescript
await syncChildrenPermission({
  resource: folderCollection,
  folderTypeList: [DatasetCollectionTypeEnum.folder],
  resourceType: PerResourceTypeEnum.collection,
  resourceModel: MongoDatasetCollection,
  collaborators: latestClbList,
  additionalFilter: { datasetId },  // 限制在同一 dataset 内
  session
});
```

---

## 5. Dataset → Collection 权限同步

当 Dataset 的协作者变更时，需要同步到其下属的所有根级 folder collection。

```typescript
// packages/service/core/dataset/collection/controller.ts
export async function syncDatasetFolderCollectionPermissions({
  datasetId,
  teamId,
  collaborators,
  session
}) {
  // 1. 获取所有根级 folder collection（parentId = null）
  const rootFolderCollections = await MongoDatasetCollection.find({
    datasetId,
    type: DatasetCollectionTypeEnum.folder,
    parentId: null,
    inheritPermission: true
  }, '_id type teamId parentId').lean();

  // 2. 逐个替换并同步
  for (const folderCollection of rootFolderCollections) {
    // 替换 folder 自身协作者
    await replaceResourceClbs({
      teamId,
      resourceId: String(folderCollection._id),
      resourceType: PerResourceTypeEnum.collection,
      collaborators,
      session
    });

    // 同步到子 collection 树
    await syncChildrenPermission({
      resource: folderCollection,
      folderTypeList: [DatasetCollectionTypeEnum.folder],
      resourceType: PerResourceTypeEnum.collection,
      resourceModel: MongoDatasetCollection,
      collaborators,
      additionalFilter: { datasetId },
      session
    });
  }
}
```

---

## 6. Collection 移动时的权限处理

### 6.1 移动接口权限检查

```typescript
// projects/app/src/pages/api/core/dataset/collection/update.ts
if (isMoving) {
  if (normalizedNewParentId) {
    // 移入 folder collection → 需目标 folder 的 manage 权限
    await authDatasetCollection({
      req, collectionId: normalizedNewParentId, per: ManagePermissionVal
    });
  }

  if (collection.parentId) {
    // 从 folder collection 移出 → 需原 folder 的 manage 权限
    await authDatasetCollection({
      req, collectionId: String(collection.parentId), per: ManagePermissionVal
    });
  }

  if (!normalizedNewParentId || !collection.parentId) {
    // 移入/移出 dataset 根级 → 需 dataset 的 manage 权限
    await authDataset({
      req, datasetId: collection.datasetId, per: ManagePermissionVal
    });
  }
}
```

### 6.2 移动时权限同步

```typescript
if (isMoving && inheritParentPermission) {
  // 获取新父级协作者
  const parentClbs = normalizedParentId
    ? await getResourceOwnedClbs({
        resourceId: normalizedParentId,
        resourceType: PerResourceTypeEnum.collection
      })
    : collection.type === DatasetCollectionTypeEnum.folder
      ? await getResourceOwnedClbs({
          resourceId: collection.datasetId,
          resourceType: PerResourceTypeEnum.dataset
        })
      : [];

  // 替换自身协作者
  await replaceResourceClbs({
    resourceType: PerResourceTypeEnum.collection,
    teamId,
    resourceId: String(id),
    collaborators: parentClbs,
    session
  });

  // 同步子树
  await syncChildrenPermission({
    resource: collection,
    folderTypeList: [DatasetCollectionTypeEnum.folder],
    resourceType: PerResourceTypeEnum.collection,
    resourceModel: MongoDatasetCollection,
    collaborators: parentClbs,
    additionalFilter: { datasetId: collection.datasetId },
    session
  });
}
```

### 6.3 移动选项

| 参数 | 说明 |
|------|------|
| `inheritParentPermission = true`（默认） | 继承新父级权限，替换自身协作者 |
| `inheritParentPermission = false` | 保持独立授权，不修改权限 |

---

## 7. 权限生效范围在 Collection 中的应用

### 7.1 Schema 定义

```typescript
// packages/global/core/dataset/type.ts
export const DatasetCollectionSchema = z.object({
  // ...
  inheritPermission: z.boolean().optional(),
  permissionEffectScope: z
    .nativeEnum(PermissionEffectScopeEnum)
    .optional()
});
```

### 7.2 创建时的自动设置

```typescript
// packages/service/core/dataset/collection/controller.ts
let inheritPermission = true;

if (parentId) {
  // 父级是 collection
  const parentCollection = await MongoDatasetCollection.findOne(
    { _id: parentId }, 'permissionEffectScope'
  ).lean();

  if (parentCollection?.permissionEffectScope === PermissionEffectScopeEnum.currentOnly) {
    inheritPermission = false;
  }
} else {
  // 父级是 dataset
  const parentDataset = await MongoDataset.findOne(
    { _id: datasetId }, 'permissionEffectScope'
  ).lean();

  if (parentDataset?.permissionEffectScope === PermissionEffectScopeEnum.currentOnly) {
    inheritPermission = false;
  }
}
```

### 7.3 行为对照

| 父级 `permissionEffectScope` | 子级 `inheritPermission` | 效果 |
|------------------------------|--------------------------|------|
| `allChildren`（默认） | `true` | 子级继承父级权限 |
| `currentOnly` | `false` | 子级独立管理权限，不继承 |

---

## 8. 恢复继承 (resumeInheritPermission)

### 8.1 Collection 恢复继承接口

```typescript
// projects/app/src/pages/api/core/dataset/collection/resumeInheritPermission.ts
async function handler(req) {
  const { collection } = await authDatasetCollection({
    req, collectionId, per: ManagePermissionVal
  });

  await mongoSessionRun(async (session) => {
    await resumeInheritPermission({
      resource: collection,
      folderTypeList: [DatasetCollectionTypeEnum.folder],
      resourceType: PerResourceTypeEnum.collection,
      resourceModel: MongoDatasetCollection,
      session
    });
  });
}
```

### 8.2 行为差异

| 资源类型 | 恢复继承行为 |
|----------|-------------|
| 非 folder Collection | 删除所有自身协作者（保留 owner），设置 `inheritPermission: true` |
| Folder Collection | 用父级协作者替换自身协作者（owner 转 manage），同步子树 |

---

## 9. 关键函数索引

| 函数 | 文件 | 用途 |
|------|------|------|
| `authDatasetCollection` | `packages/service/support/permission/dataset/auth.ts` | Collection 鉴权入口 |
| `getCollectionTmbPermission` | `packages/service/support/permission/dataset/auth.ts` | 递归计算 collection 有效权限 |
| `syncDatasetFolderCollectionPermissions` | `packages/service/core/dataset/collection/controller.ts` | Dataset 权限同步到 folder collection |
| `createOneCollection` | `packages/service/core/dataset/collection/controller.ts` | 创建 collection（含权限初始化） |
| `resumeInheritPermission` | `packages/service/support/permission/inheritPermission.ts` | 恢复继承 |
| `replaceResourceClbs` | `packages/service/support/permission/inheritPermission.ts` | 替换资源协作者 |
| `syncChildrenPermission` | `packages/service/support/permission/inheritPermission.ts` | 同步权限到子树 |
