# Collection 文件级权限管理设计文档

> 分支：`feat-collection-permissions-v2` ｜ 基于 main 分支物化权限架构（materialize resource permissions）
>
> 本文档描述 FastGPT knowledge base 下 **collection（文件/文件夹）** 独立于 dataset 的文件级权限维度，建立在 main 已重构的**物化资源权限**架构之上，复用通用权限 service 原语，为 collection 提供薄适配层。

## 1. 背景与目标

### 1.1 背景

FastGPT 的权限体系为 team 级资源权限，资源权限记录统一存储于 `resource_permissions` 集合，`resourceType` 枚举当前为 `team / app / dataset / model / agentSkill`——**尚无 `collection`**。当前 collection 的可见性完全由所属 dataset 的权限决定，无法对单个文件/文件夹配置协作者。

main 分支完成了权限架构重构——**物化资源权限（materialize resource permissions）**：

- 每个资源在 `resource_permissions` 中存储其**完整有效 ACL 快照**（含来自祖先继承的部分），读权限、列表过滤、批量可读解析均直接读快照，不再运行时合并父链。
- 提供**通用 service 原语**（`packages/service/support/permission/resourcePermissionService.ts`）：`createResourcePermissions` / `updateResourceCollaborators` / `moveResourcePermissions` / `resumeResourcePermissionInheritance` / `syncResourceTreePermissions`。
- 提供**策略层**（`resourcePermissionPolicy.ts`）：`calculateInheritedResourceCollaborators`（自旧快照剥离父级贡献、反推自身 clbs 再与新父级合并）、`mergeResourceCollaborators`、`toInheritedCollaborators`（父级 owner→manage）、`shouldInheritResourcePermission`。
- 提供**仓储层**（`repository/resourcePermissionRepo.ts`）：`findByResource` / `replaceResource` / `patchResources` / `deleteByResource` / `findResourceKeysByCollaboratorsPermission`（批量可读资源 ID 查询）。

需求要求为 collection 增加：文件级协作者配置、继承/独立态、move/恢复继承/changeOwner、统一鉴权、列表权限过滤、隐藏路径穿透平铺、检索（RAG）召回过滤、当前路径限定搜索、并发控制与存量迁移。

**核心原则**：collection 权限层不做平行实现，而是**复用通用权限原语**，仅在 collection 的**跨类型父级**（根 collection 的父级是 dataset）这一唯一边界上提供适配。

### 1.2 目标

- 落地 collection 文件级权限全部功能，满足 NFR-1（10k collections 列表 P95 ≤ 800ms）、NFR-2（批量同步 ≤ 30s）、NFR-7（检索过滤 P95 ≤ 200ms）、NFR-8（越权召回 = 0）。
- 兼容现有 dataset 级权限语义：dataset `read` 是门槛，collection `read` 是文件级维度，二者取 AND。
- 复用 main 通用权限原语，将 collection 权限层收敛为薄适配层，与 main 演进同步。

---

## 2. 术语与数据模型

### 2.1 核心术语

| 术语 | 含义 |
|---|---|
| 物化 ACL（materialized ACL） | 资源在 `resource_permissions` 中的完整有效权限快照，含继承自祖先的部分；读路径直接读快照 |
| 继承态 / 独立态 | `inheritPermission=true`（默认）：collection 快照 = `merge(父级有效 clbs, 自身 clbs)`，父级变更自动传播；`false`：独立配置，不被父级变更覆盖，子树也不再传播 |
| 自身 clbs（own clbs） | 资源相对父级独有的协作者贡献（含 owner）；由 `calculateInheritedResourceCollaborators` 从旧快照剥离父级后反推 |
| 跨类型父级 | collection 的父级有两种：非根（`parentId` 有值）= collection folder（同类型）；根（`parentId` 空）= dataset（跨类型）。这是 collection 适配层的唯一边界 |
| `hasSetCollectionPermissions` | dataset 级布尔短路标记：该 dataset 下是否存在独立配置的 collection；`false` 时 collection 可读 == dataset 可读（O(1) 短路） |
| `permissionVersion` | 乐观并发控制版本号，权限写路径 CAS 递增 |

### 2.2 数据模型

#### 2.2.1 `PerResourceTypeEnum` 扩展

`packages/global/support/permission/constant.ts` 的 `PerResourceTypeEnum` 增加 `collection`：

```typescript
export const PerResourceTypeEnum = {
  team: 'team',
  app: 'app',
  dataset: 'dataset',
  model: 'model',
  agentSkill: 'agentSkill',
  collection: 'collection'
} as const;
```

`resource_permissions.resourceId` 复用现有键，`resourceName` 键不用于 collection。

#### 2.2.2 `dataset_collections` 表

`packages/service/core/dataset/collection/schema.ts`（已有 `parentId` / `datasetId` / `type` / `tmbId`）新增字段：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `inheritPermission` | Boolean | `true` | 继承态标记 |
| `permissionVersion` | Number | `1` | 乐观并发控制版本号，CAS 写路径递增 |

#### 2.2.3 `datasets` 表

`packages/service/core/dataset/schema.ts`（已有 `inheritPermission`）新增字段：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `hasSetCollectionPermissions` | Boolean | `false` | collection 短路标记 |
| `permissionVersion` | Number | `1` | 乐观并发控制版本号 |

> `hasSetCollectionPermissions` 仅作**性能短路**，不作正确性依赖（物化快照直查本身正确）。

#### 2.2.4 `resource_permissions` 表

表结构无需变更（main 已物化）。collection 复用：

- `resourceType = 'collection'`、`resourceId = collectionId`；
- 快照为完整有效 ACL（全物化，与 app/dataset 一致）；
- 唯一键 `(teamId, resourceType, resourceId, tmbId/groupId/orgId)` 保证同步幂等。

---

## 3. 方案选型

| # | 决策 | 结论 |
|---|---|---|
| D1 | **权限存储与传播** | 复用通用 service 原语（create/update/move/resume/syncResourceTreePermissions）+ 策略层，不平行实现 |
| D2 | **跨类型父级解析** | 给通用原语增加**可选父级覆盖参数**（`parentResourceType` / `parentResourceId` 或 `parentCollaborators`），覆盖"根 collection → dataset"边界；见 §3.2 |
| D3 | **dataset → 根 collection 传播** | collection 侧导出**跨树 hook** `syncDatasetRootCollections`，由 dataset 写路径在同一事务内调用；见 §3.3 |
| D4 | **列表/RAG 过滤** | 用 main `findResourceKeysByCollaboratorsPermission` 批量可读解析（新增 collection 分支）+ 两阶段 ID 过滤；见 §7 |
| D5 | **短路标记** | 保留 `hasSetCollectionPermissions`，纯继承态下 O(1) 跳过 O(N) 查询；定位为性能优化 |
| D6 | **并发控制** | `permissionVersion` CAS（N4 冻结/S-4 已选型），冲突返回 `inheritPermissionError(507005)`；见 §8 |
| D7 | **迁移** | 扩展 main 的 `permissionMigration`，复用运行时同一套同步原语；见 §12 |
| D8 | **changeOwner** | 扩展 `pro/admin` changeOwner，`changeOwnerType` 增加 `'collection'`，跳过 OutLink 同步 |

### 3.1 权限存储与传播

通用 service 已实现全物化 + old/new diff 树同步，与 collection 所需语义完全一致：

- `createResourcePermissions`：父级 clbs 与 owner 合并，`replaceResource` 写入快照；
- `updateResourceCollaborators`：冲突检测（`checkRoleUpdateConflict` → 自动翻转 `inheritPermission=false`）+ 替换 ACL + `syncResourceTreePermissions` 传播子树；
- `moveResourcePermissions`：`calculateInheritedResourceCollaborators`（剥离旧父级、合并新父级）+ 子树同步；
- `resumeResourcePermissionInheritance`：保留相对当前父级独有的权限位 + 子树同步；
- `syncResourceTreePermissions`：按 `resourceModel.find({ parentId })` 同类型 BFS + diff `patchResources`。

### 3.2 跨类型父级解析（通用原语最小扩展）

通用原语通过 `(resourceType, resource.parentId)` 读父级，对 collection 只有**根 collection（parentId 空，父级=dataset）**不成立。采用可选父级覆盖参数：

| 原语 | 扩展 |
|---|---|
| `createResourcePermissions` | 新增可选 `parentResourceType?` / `parentResourceId?`，提供时父级从 `(type, id)` 读取 |
| `updateResourceCollaborators` | 冲突判断条件由 `resource.parentId && ...` 放宽为 `(resource.parentId \|\| parentCollaborators?.length) && ...`，使根 collection 传入 dataset 父级时也能触发冲突翻转 |
| `moveResourcePermissions` | 新增可选 `oldParentCollaborators?`，提供时替代内部旧父级读取（"从根移动"场景） |
| `resumeResourcePermissionInheritance` | 新增可选 `parentResourceType?` / `parentResourceId?` |
| `syncResourceTreePermissions` | 无需改动：collection folder 的子节点同类型；跨类型由 collection 侧 hook 承担（§3.3） |

另：`findResourceKeysByCollaboratorsPermission.getResourceKey()` 增加 `collection → 'resourceId'` 分支（当前对 collection 抛错）。

### 3.3 dataset → 根 collection 传播（跨树 hook）

根 collection 快照 = `merge(dataset 有效 clbs, 自身 clbs)`。dataset ACL 变更（本 dataset 或继承态祖先 dataset）必须重新物化其根 collection 快照。通用 service 无法跨类型遍历，由 collection 侧导出：

```
syncDatasetRootCollections({ teamId, datasetId, oldEffectiveClbs, newEffectiveClbs, session })
```

- 将 `datasetId` 的根级继承态 collection 从 `oldEffectiveClbs` 重新物化到 `newEffectiveClbs`；folder 经 `syncResourceTreePermissions`（collection 类型）递归子树。
- 由 **dataset 写路径**（update move / collaborator update / resume）在**同一事务**内调用，hook 内部自顶向下推导受影响 dataset 子树（新架构下 dataset 快照已物化，"有效 clbs"即快照）。
- dataset 模块耦合为**一个函数调用**。

---

## 4. 修改概述

### 4.1 接口总览

**新增接口：**

| 功能 | 方法 + 路径 | 位置 |
|---|---|---|
| 协作者配置 | `POST /api/proApi/core/dataset/collection/collaborator/update` | fastgpt-pro |
| 恢复继承 | `POST /api/core/dataset/collection/resumeInheritPermission` | fastgpt-app |
| changeOwner | `POST /api/proApi/core/dataset/collection/changeOwner` | fastgpt-pro |
| 升级/初始化 | 对齐 admin `initPermission` 模式（批量物化） | fastgpt-pro admin |
| 列表过滤 + 平铺 | `GET /api/core/dataset/collection/list`（改造） | fastgpt-app |
| 当前路径限定搜索 | `GET /api/core/dataset/list`、`GET /api/core/dataset/collection/list`（改造） | fastgpt-app |

**现有接口权限升级（CRUD 门槛）：**

| 接口 | 现状 | 目标 |
|---|---|---|
| `POST /api/core/dataset/collection/create` | dataset write | 父 collection folder `write` 或 dataset `write` 及以上；根创建需 dataset `write` |
| `PUT /api/core/dataset/collection/update` | collection write | 非 move：collection `write`；move：源父级 + 目标父级 `manage`（根 ↔ 目录需 `TeamDatasetCreatePermissionVal`），**不接收 `inheritPermission`** |
| `DELETE /api/core/dataset/collection/delete` | collection write | collection `write`（folder 递归删子树） |
| `GET /api/core/dataset/collection/detail` | collection read | dataset `read`（门槛）+ collection `read` |

### 4.2 接口通用约束

- 所有写路径统一 `mongoSessionRun` 事务 + `permissionVersion` CAS（§8）。
- 列表/详情/检索：**先 dataset `read` 门槛，再 collection `read`**；单独的 collection 权限不能绕过 dataset 门槛。
- 协作者接口不可授予 owner，owner 仅由创建默认、changeOwner 产生。

---

## 5. 通用 service 适配层

collection 权限层收敛为 `packages/service/support/permission/collection/` 薄适配层：

```
packages/service/support/permission/collection/
├── auth.ts          # authDatasetCollection：物化快照直读 + 短路
├── parent.ts        # resolveCollectionParentClbs：跨类型父级解析原语
├── create.ts        # createCollectionPermissions：适配 createResourcePermissions
├── collaborators.ts # updateCollectionCollaborators：适配 updateResourceCollaborators
├── move.ts          # moveCollectionPermissions：适配 moveResourcePermissions
├── resume.ts        # resumeCollectionInheritance：适配 resumeResourcePermissionInheritance
├── sync.ts          # syncDatasetRootCollections：跨树 hook（dataset → 根 collection）
├── datasetFlag.ts   # hasSetCollectionPermissions 短路标记读写
└── resolve.ts       # getReadableCollectionIds / resolveReadableCollectionIds（列表 + 检索复用）
```

### 5.1 跨类型父级解析原语

```typescript
// parent.ts
/** 读取 collection 的父级有效 clbs：
 *  - parentId 有值：父级为 collection folder（同类型），读其物化快照；
 *  - parentId 为空（根）：父级为 dataset，读其物化快照（main 已物化为完整有效 ACL）。
 */
export const resolveCollectionParentClbs = async ({
  teamId, datasetId, parentId, session
}: {
  teamId: string;
  datasetId: string;
  parentId: ParentIdType;
  session?: ClientSession;
}): Promise<CollaboratorItemType[]> => {
  return parentId
    ? resourcePermissionRepo.findByResource({
        teamId, resourceType: PerResourceTypeEnum.collection,
        resourceId: String(parentId), session
      })
    : resourcePermissionRepo.findByResource({
        teamId, resourceType: PerResourceTypeEnum.dataset,
        resourceId: datasetId, session
      });
};
```

### 5.2 通用原语 → collection 适配映射

| 场景 | 适配层 | 通用原语（复用） |
|---|---|---|
| 创建（根） | `resolveCollectionParentClbs(..., parentId: null)` → 父级=dataset | `createResourcePermissions`（传 `parentResourceType: dataset, parentResourceId: datasetId`） |
| 创建（folder/非根） | parentId 有值，同类型 | `createResourcePermissions`（默认行为） |
| 更新协作者 | `resolveCollectionParentClbs` → 作为 `parentCollaborators` | `updateResourceCollaborators`（含冲突翻转） |
| 移动 | 目标父级 = `resolveCollectionParentClbs(targetParentId)`；源父级 = `resolveCollectionParentClbs(sourceParentId)`（根=dataset） | `moveResourcePermissions`（传 `newParentCollaborators` + `oldParentCollaborators`） |
| 恢复继承 | `resolveCollectionParentClbs` → 传父级覆盖 | `resumeResourcePermissionInheritance` |
| folder 子树同步 | 子节点同类型 | `syncResourceTreePermissions`（默认行为） |
| dataset → 根 collection | 跨树 | `syncDatasetRootCollections`（collection 侧 hook，§5.3） |

### 5.3 跨树 hook：`syncDatasetRootCollections`

```typescript
// sync.ts
/**
 * dataset 有效 clbs 变更后，将该 dataset 下所有根级继承态 collection 的快照
 * 从 oldEffectiveClbs 重新物化到 newEffectiveClbs；folder 递归同步子树。
 * 由 dataset 写路径（collaborator/move/resume）在同一事务内调用。
 * 需自顶向下推导受影响 dataset 子树（继承态后代 dataset 的有效 clbs 变化）。
 */
export async function syncDatasetRootCollections({
  teamId, datasetId, oldEffectiveClbs, newEffectiveClbs, session
}: {
  teamId: string;
  datasetId: string;
  oldEffectiveClbs: CollaboratorItemType[];
  newEffectiveClbs: CollaboratorItemType[];
  session: ClientSession;
}): Promise<void>
```

实现要点：

1. 收集 `datasetId` 及其继承态后代 dataset（读 `MongoDataset` 的 `_id/parentId/inheritPermission`）；
2. 批量加载后代 dataset 物化快照（`$in`，无 N+1）；
3. BFS 自顶向下推导每个 dataset 的旧/新有效 clbs（`merge(父级有效 clbs, 自身 clbs)`，自身 clbs 由 `calculateInheritedResourceCollaborators` 反推）；
4. 对每个 dataset，将其根级继承态 collection（`parentId: null, inheritPermission != false`）从旧有效 clbs 物化到新有效 clbs，folder 经 `syncResourceTreePermissions`（`resourceType: collection`）递归子树；
5. 批量 diff `patchResources` 写入，幂等。

**dataset 模块集成（最小耦合）**：dataset 写路径在事务内、权限传播完成后追加一行：

```
await syncDatasetRootCollections({ teamId, datasetId, oldEffectiveClbs, newEffectiveClbs, session });
```

涉及：`projects/app/src/pages/api/core/dataset/update.ts`（move）、`pro/admin/.../dataset/collaborator/update.ts`、`.../dataset/resumeInheritPermission.ts`。

---

## 6. Collection 权限核心设计

### 6.1 dataset 权限变更如何影响其下 collection

新架构下 dataset 快照已物化，**有效 clbs == 物化快照**。dataset 权限变更的传播：

1. dataset 自身 ACL 变更（collaborator update / move / resume）→ dataset 模块用 `syncResourceTreePermissions` 传播到继承态后代 dataset；
2. collection 侧 hook `syncDatasetRootCollections` 在同一事务内，将受影响 dataset（含后代）的根 collection 快照重新物化（§5.3）。

影响面统一为：**受影响 dataset 的根级继承态 collection 及其子树**。

### 6.2 collection 权限数据模型与不变量

| 不变量 | 说明 |
|---|---|
| 全量物化 | 每个 collection 的 `resource_permissions` 均为完整有效 ACL（含祖先贡献），读路径不递归父链 |
| 继承态 | `inheritPermission=true`：快照 = `merge(父级有效 clbs, 自身 clbs)`；父级 owner 经 `toInheritedCollaborators` 降级为 manage |
| 独立态 | `inheritPermission=false`：快照 = 自身 clbs，不被父级变更覆盖；子树不再传播 |
| owner 唯一 | owner 由创建默认（collection `tmbId`）、changeOwner 产生；协作者接口不可授予 owner；owner 始终保留在自身记录 |
| dataset 门槛 | collection 级可读性必须与 dataset `read` 取 AND（§7.3） |

### 6.3 权限解析：`authDatasetCollection`

`packages/service/support/permission/dataset/auth.ts` 当前 `authDatasetCollection` 透传 dataset 权限（无 collection 维度），需升级为：

```typescript
// auth.ts
export async function authDatasetCollection({
  req, authToken, authApiKey, collectionId, per, datasetId
}) {
  // 1. dataset read 门槛
  const datasetAuth = await authDataset({ req, authToken, authApiKey, datasetId, per: ReadPermissionVal });
  // 2. 短路：root / team owner / hasSetCollectionPermissions=false（纯继承 → collection 可读 == dataset 可读）
  if (datasetAuth.isRoot || datasetAuth.isTeamOwner) return withCollectionPermission(datasetAuth, { isOwner: true });
  if (datasetAuth.dataset.hasSetCollectionPermissions === false) return datasetAuth;
  // 3. 物化快照直读 collection 权限（getTmbPermission 语义）
  const { permission } = await getTmbPermission({
    resourceType: PerResourceTypeEnum.collection,
    teamId, tmbId, resourceId: collectionId, per
  });
  if (!permission) return Promise.reject(CollectionErrEnum.unAuthCollection);
  return withCollectionPermission(datasetAuth, { permission });
}
```

物化快照直读，无父链递归。

### 6.4 协作者配置接口

接口 `POST /api/proApi/core/dataset/collection/collaborator/update`（fastgpt-pro），流程对齐 app/dataset 的 `updateResourceCollaboratorsWithAuth`：

```typescript
// collaborators.ts
export async function updateCollectionCollaboratorsWithAuth({
  collection, collaborators, authorize
}) {
  return mongoSessionRun(async (session) => {
    const parentClbs = await resolveCollectionParentClbs({
      teamId: collection.teamId, datasetId: collection.datasetId,
      parentId: collection.parentId, session
    }); // 跨类型：根 collection → dataset 有效 clbs
    const oldChildClbs = await getResourceOwnedClbs({
      resourceType: PerResourceTypeEnum.collection, teamId,
      resourceId: String(collection._id), session
    });
    const changedClbs = getChangedCollaborators({ newRealClbs: collaborators, oldRealClbs: oldChildClbs });
    await authorize(changedClbs);
    if (changedClbs.length === 0) return { changedClbs, collaborators, updated: false };
    await updateResourceCollaborators({
      collaborators, resourceType: PerResourceTypeEnum.collection,
      resource: collection, resourceModel: MongoDatasetCollection,
      folderTypeList: [DatasetCollectionTypeEnum.folder],
      oldChildClbs, parentClbs, session
    }); // 冲突翻转 + replaceResource + syncResourceTreePermissions
    await markDatasetCollectionPermissionsSet({ datasetId: collection.datasetId, session });
    return { changedClbs, collaborators, updated: true };
  });
}
```

关键点：

- **冲突检测**：`updateResourceCollaborators` 对"试图修改/删除父级协作者"的继承态 collection 自动置 `inheritPermission=false`（独立态），配合 §3.2 的父级参数扩展，根 collection 也能触发。
- 授权校验：非 owner 不能改自己的权限；不能越权授予 admin 权限。
- 配置即视为"已设置 collection 权限"，置 `hasSetCollectionPermissions=true`。

### 6.5 创建 collection

`POST /api/core/dataset/collection/create`，事务内：

```typescript
const parentClbs = await resolveCollectionParentClbs({ teamId, datasetId, parentId, session });
await createResourcePermissions({
  resource: { ...collectionDoc, tmbId },
  resourceType: PerResourceTypeEnum.collection,
  parentResourceType: parentId ? PerResourceTypeEnum.collection : PerResourceTypeEnum.dataset,
  parentResourceId: parentId ?? datasetId, // 根 collection → dataset 父级
  tmbId, session
});
// 独立态创建（inheritPermission=false）时：
//   createResourcePermissions 父级读空 → 仅 owner 快照；
//   并 markDatasetCollectionPermissionsSet(...)
```

继承态 folder 与普通 collection 都写 `merge(parentClbs, [owner])` 完整快照；独立态仅 owner 记录。

### 6.6 移动 collection

`PUT /api/core/dataset/collection/update`（`parentId` 变更即 move），**不接收 `inheritPermission`**（保持 collection 自身继承关系）。事务内：

```typescript
const newParentClbs = await resolveCollectionParentClbs({
  teamId, datasetId, parentId: targetParentId, session
});
const oldParentClbs = collection.inheritPermission === false
  ? [] // 此前独立 → 当前快照全为自身 clbs
  : await resolveCollectionParentClbs({
      teamId, datasetId, parentId: collection.parentId, session
    });
await moveResourcePermissions({
  resource: collection, newParentId: targetParentId,
  resourceModel: MongoDatasetCollection,
  resourceType: PerResourceTypeEnum.collection,
  newParentCollaborators: newParentClbs,
  oldParentCollaborators: oldParentClbs, // "从根移动"场景
  session
});
// folder 移动：moveResourcePermissions 内部经 syncResourceTreePermissions 递归子树
```

`moveResourcePermissions` 内置 `calculateInheritedResourceCollaborators`（剥离旧父级 + 合并新父级）。移动权限校验：源父级 + 目标父级 `manage`；根 ↔ 目录需 `TeamDatasetCreatePermissionVal`（§4.1）。深度校验沿用 `checkMoveFolderDepth`。

### 6.7 恢复继承

`POST /api/core/dataset/collection/resumeInheritPermission`，事务内：

```typescript
await resumeResourcePermissionInheritance({
  resource: collection, resourceModel: MongoDatasetCollection,
  resourceType: PerResourceTypeEnum.collection,
  parentResourceType: collection.parentId ? PerResourceTypeEnum.collection : PerResourceTypeEnum.dataset,
  parentResourceId: collection.parentId ?? collection.datasetId,
  session
});
```

保留相对当前父级独有的权限位并同步子树（通用原语内置）。

### 6.8 changeOwner

`POST /api/proApi/core/dataset/collection/changeOwner`：

- 扩展 `pro/admin/src/service/core/changeOwner.ts`：`changeOwnerType` 增加 `'collection'`；使用 `MongoDatasetCollection` 模型；
- 子资源遍历改为 collection 树（`parentId` 子树）；
- owner 记录更新复用 `transferTmbPermissions`（按资源类型批处理）；
- **跳过 OutLink 同步**（collection 无 OutLink）；
- 同步更新 collection 文档 `tmbId` 字段 + `resource_permissions` owner 记录（owner 唯一不变量）。

---

## 7. 可见性设计

### 7.1 文件列表按权限过滤

`GET /api/core/dataset/collection/list`，两阶段 ID 过滤 + 批量可读解析：

1. **候选查询**：以 `datasetId` 为边界查询 collection 权限最小字段 `{ _id, parentId, type, inheritPermission, tmbId }`（根目录不按 `parentId=null` 过滤，避免漏掉隐藏 folder 下有权限的文件）。
2. **短路判定**（任选其一，降序）：
   - 团队管理员/团队所有者：全部可读；
   - `hasSetCollectionPermissions === false` 且 dataset `read` 通过：全部可读（O(1)）；
   - 其余：`findResourceKeysByCollaboratorsPermission({ resourceType: collection, resourceId: $in 候选ids, permission: ReadPermissionVal })` → 可读 ID 集合。该原语新增 collection 分支（`getResourceKey()` 返回 `'resourceId'`），查询端 `$bitsAnySet` 过滤拒绝/无读记录。
3. 构建平铺层级（内存 O(N)，§7.2）→ 当前目录 `visibleIds` → MongoDB 二次排序分页（`sort(updateTime).skip(offset).limit(pageSize)`）→ 当前页完整字段 + 统计回查（`$in` 批量聚合，无 N+1）。

NFR-1（10k collections P95 ≤ 800ms）：`$in` 批量 + 短路 + 单次 linear 平铺达成。

### 7.2 文件夹权限穿透与平铺展示

- 用户对父 folder 无权限、对子 collection 有 `read` 时，子 collection 平铺到最近可读祖先下展示，不暴露隐藏路径；
- 不可读节点不展示，但其下可读子孙提升；
- 自顶向下一次遍历维护 `nearestVisible` 指针，总复杂度 O(N)，不做 O(V×D) 回溯；
- 仅有 collection 权限、无 dataset `read`：不展示 dataset 也不展示其下 collection；
- 不可读中间 folder 不阻断可读下级 collection 返回。

算法：按 `parentId` 建立 collection 目录树（含不可读节点）；自顶向下遍历，可读节点展示父级 = `nearestVisible` 并更新指针，不可读节点保持指针继续下钻；筛选"展示父级 == 当前目录"的节点得到 `visibleIds`。权限记录读取用 `findResourceKeysByCollaboratorsPermission`（含 `matchLogic`/`personalPermissionPriority` 语义）。

### 7.3 知识库权限门槛

- dataset `read` 是前置门槛：详情、列表、检索均先校验；
- collection `read` 是文件级维度；文件级 read 不能绕过知识库门槛；
- 知识库无 `read` 时知识库及其全部文件均隐藏；
- 列表/详情/检索共用同一"可读 collection 批量解析"函数（`resolveReadableCollectionIds`），避免"列表可见但点进去无权限"。

### 7.4 检索（RAG）召回权限过滤

检索在 dataset `read` 鉴权通过后，叠加 collection `read` 对召回候选过滤。**授权集合必须在召回查询阶段生效**，不能仅在结果展示时过滤（向量/全文召回本身可能已返回无权限内容）。

流程：

1. **dataset 前置鉴权**：过滤出有 `read` 的 dataset；
2. **解析可读 collection 集合**：`resolveReadableCollectionIds` 输入 `teamId/datasetIds/tmbId` →
   - 团队管理员 / team owner：返回 `undefined`（无 collection 级过滤，按 dataset 召回）；
   - 全部目标 dataset `hasSetCollectionPermissions === false` 且 read 通过：返回 `undefined`（短路）；
   - 否则：`findResourceKeysByCollaboratorsPermission({ resourceType: collection, permission: ReadPermissionVal })` → 可读 collection ID（folder 递归展开为实际文件 ID）；dataset read 未通过的 dataset 整体排除；
   - `undefined` 语义：`decideCollectionFilter` 识别为"无需权限过滤"，不设置 `collectionId IN`，跳过全量判定比较。
3. **合并检索条件**：可读集合 ∩ 用户元数据 collection 条件 ∩ 排除 `forbidCollectionIdList` → `effectiveCollectionIdList`；交集为空直接返回空结果；
4. **决定是否设置 `collectionId` 过滤**：可读集合覆盖该 dataset 全部 collection 时**不设置**（避免上万 ID 的长过滤条件）；真子集时才设置并下沉到向量/全文召回；
5. **结果回查防御**：召回返回 data 后 Mongo 回查再附加 `collectionId IN effectiveCollectionIdList`；
6. **统一覆盖所有检索入口**：工作流 dataset 检索、Agent dataset 检索、search-test、OpenAPI。

NFR-7（P95 ≤ 200ms）：批量 `$in` + 短路 + `undefined` 不设过滤语义。NFR-8（越权召回 = 0）：授权集合在召回与回查两层生效。

### 7.5 当前路径限定搜索

`GET /api/core/dataset/list`、`GET /api/core/dataset/collection/list` 的 `searchText` 行为：搜索时不以当前 `parentId` 限定候选，而以 `datasetId` 为边界 + 权限过滤后，将结果限定到当前目录的可见范围（平铺后 `visibleIds` 交集）。

---

## 8. 并发与一致性：`permissionVersion` CAS

### 8.1 机制

所有 collection / dataset 权限写路径统一执行**读-比较-写（CAS）**：

```
1. 读取资源文档 permissionVersion = v（事务内）
2. 事务内完成快照计算与替换（replaceResource / patchResources）
3. 对资源文档执行 CAS：updateOne({ _id, permissionVersion: v }, { $inc: { permissionVersion: 1 } })
4. 修改行数为 0 → 版本已被并发写推进 → 抛 inheritPermissionError(507005) 提示重试
```

### 8.2 覆盖的写路径

| 路径 | CAS 对象 |
|---|---|
| collection 协作者更新 / 继承切换 | collection 文档 |
| collection move / resume | collection 文档 |
| collection changeOwner | collection 文档 |
| 升级（F010） | collection / dataset 文档（分批） |
| dataset 协作者 / move / resume | dataset 文档（供根 collection 依赖） |

### 8.3 一致性边界

- 子树传播（`syncResourceTreePermissions` / `syncDatasetRootCollections`）在同一事务内完成，Mongo 事务串行化保证原子性；CAS 仅对**入口资源**做业务层冲突信号，传播节点不逐条 CAS。
- 版本冲突返回 `507005` 的时机：入口资源 CAS 失败。事务已隔离，CAS 将并发覆盖转为明确报错。
- 删除 dataset/collection 时不递增版本（资源不复存在）。

---

## 9. 可靠性设计

### 9.1 事务边界

- 所有权限写操作（协作者 / move / resume / changeOwner / 升级）统一 `mongoSessionRun`。
- 权限写与 collection/dataset 文档更新在同一事务。
- 删除 Collection / Collection Folder / Dataset：同一事务内按 `resourceType + resourceId`（`$in`）清理 `resource_permissions`；失败整体回滚，禁止孤儿权限记录（复用 repo `deleteByResource` / `deleteByResources`）。

### 9.2 幂等性

- `resource_permissions` 唯一键 + `replaceResource`/`patchResources` diff 写入：重复执行产生 0 变更。
- CAS 版本递增：同一请求重试在版本推进后重新读取。

### 9.3 失败回滚

- 事务异常整体回滚；
- `syncDatasetRootCollections` 产生大量 ops 时按批次 `bulkWrite`（NFR-2，≤30s）。

### 9.4 一致性边界

- 列表、详情、检索共用同一可读解析函数；
- `syncDatasetRootCollections` 与 dataset 写路径同事务，避免 dataset 变更成功而根 collection 快照过期。

---

## 10. 性能设计

### 10.1 读性能

- 物化快照：collection 鉴权/列表/检索单表读自身快照，无父链递归；
- 列表/检索 `findResourceKeysByCollaboratorsPermission` 批量 `$in` + 查询端 `$bitsAnySet` 过滤（只加载与当前用户相关行）；
- 短路：团队管理员 / `hasSetCollectionPermissions=false` / 全继承态——O(1) 跳过 distinct 查询。

### 10.2 写性能

- `syncResourceTreePermissions` / `syncDatasetRootCollections`：复杂度 O(受影响节点数 × 协作者数)，diff `patchResources` 批量写入；
- folder 深度沿用 `MAX_FOLDER_DEPTH` 限制；
- 大批量同步分批 bulkWrite（NFR-2 ≤ 30s）。

### 10.3 索引建议

- `dataset_collections` 已有 `{ teamId, datasetId, parentId, updateTime }`，支撑列表与 folder 递归；
- 补 `{ teamId, datasetId, parentId, inheritPermission }` 复合索引（按继承态扫描子树）；
- `resource_permissions` 复用现有 `(teamId, resourceType, resourceId)` 索引（collection 批量 `$in` 命中）。

---

## 11. 边界条件与异常处理

| 场景 | 处理策略 |
|---|---|
| 循环 parentId | `checkMoveFolderDepth` / `checkCreateFolderDepth` 拦截 |
| 移动到根目录 | 目标父级 = dataset 有效 clbs；需 `TeamDatasetCreatePermissionVal` |
| 独立态 collection 被 move | 强制继承态：`oldParentClbs=[]`，旧快照全为自身 clbs，与目标父快照合并 |
| 父级 owner 在子资源中 | `toInheritedCollaborators` 降级为 manage |
| 根 collection 更新协作者冲突 | 传入 dataset 父级 `parentCollaborators`，通用冲突检测触发 → 翻转独立态 |
| 恢复继承时父级无权限 | 仅保留自身 clbs（含 owner） |
| 删除 Collection / Folder / Dataset | 同事务批量清理 `resource_permissions`（`$in`），失败回滚，无孤儿记录 |
| 只拥有文件权限无知识库权限 | 不展示文件，不展示知识库（dataset 门槛） |
| 并发写同资源 | `permissionVersion` CAS，冲突返回 `inheritPermissionError(507005)` |
| 升级与用户并发配置互相覆盖 | CAS + 幂等键 + 低峰执行 |

---

## 12. 升级与存量权限迁移

升级前 collection 无独立权限记录，所有存量 collection 按 dataset 权限语义初始化。**扩展 main 的 `permissionMigration.ts`**（`projects/app/src/service/admin/4162/permissionMigration.ts`，现物化 `app/dataset/agentSkill`），新增 collection 物化阶段。

### 12.1 升级目标

- 存量 collection 写入 `inheritPermission=true` 默认值；
- 每个 collection 建立 `resourceType=collection` 的物化快照：根 collection 父级来源 = 所属 dataset 物化快照；非根 = 父 collection folder 快照；`merge(父级, [owner])`（owner 取 collection `tmbId`）；
- 每个 dataset 设置 `hasSetCollectionPermissions=false`（默认，短路生效）；
- `permissionVersion=1` 初始化（collection 与 dataset）。

### 12.2 升级流程（每 dataset 一批，事务 + 幂等 + 可断点续跑）

1. 检测异常：构建 collection 树查循环引用 / 孤儿 `parentId`（循环 folder 临时退出继承态；孤儿 folder 按根处理）；
2. 自顶向下按 `parentId` 层级：根 collection 用 dataset 快照为父级，folder 递归（用 `syncDatasetRootCollections` 重建根、`syncResourceTreePermissions` 递归子树——**与运行时同一套原语**）；
3. 清理重复 owner 记录；校验 owner 唯一、快照符合嵌套模型；
4. 每 dataset/批次独立事务提交迁移进度（`permissionMigrationVersion`），失败批次记录 `datasetId/collectionId/error`，可重试。

### 12.3 手动升级接口

对齐 admin `initPermission` 模式，按团队触发批量物化；`idempotencyKey` 必填；单次 >30s 转异步任务并对同一资源路径写串行化。

---

## 13. 单测覆盖建议

| 模块 | 用例 |
|---|---|
| 跨类型父级解析 | 根（parentId=null → dataset clbs）；非根（→ folder 快照）；独立态（父级读空） |
| 创建 | 根继承态/独立态；folder 递归子树 |
| 协作者更新 | 继承态无冲突（保留自身 clbs）；冲突翻转独立态；根 collection 冲突（dataset 父级） |
| move | 根→folder；folder→根；独立态移动；folder 移动递归子树 |
| 恢复继承 | 保留相对父级独有位；父级无权限仅留自身 clbs |
| 冲突检测 | 修改/删除父级协作者 → 翻转；owner 不可经协作者接口授予 |
| 物化快照 | 各写路径后快照 = merge(父级, 自身)；owner→manage 降级 |
| `findResourceKeysByCollaboratorsPermission` | collection 分支；`$bitsAnySet` 过滤拒绝记录 |
| 短路 | `hasSetCollectionPermissions=false` 时列表/检索短路；团队管理员短路 |
| 并发 | `permissionVersion` CAS 冲突 → 507005；事务回滚 |
| changeOwner | 子树 owner 更新；无 OutLink 同步 |

## 14. 集成测试覆盖建议

- dataset 权限变更 → 根 collection 快照一致（含继承态后代 dataset）；
- 隐藏 folder 穿透平铺：无权限中间 folder 下可读 collection 提升展示，不暴露隐藏路径；
- 越权召回 = 0：向量/全文双引擎 + 回查两层过滤；
- 列表与详情鉴权一致：列表可见即详情可入；
- 升级（F010）幂等、可断点续跑；升级后与运行时同步结果一致；
- 并发：同资源并发写 → 单方成功 + 507005；子树传播原子。

---

## 15. 待确认问题

| # | 问题 | 影响 |
|---|---|---|
| 1 | 通用原语父级覆盖参数的命名与放置（`parentResourceType/parentResourceId` vs `parentCollaborators`） | 仅实现细节，不影响架构 |
| 2 | `hasSetCollectionPermissions` 与 `permissionVersion` 是否合并为 dataset 单一"权限已设置"标记 | 影响迁移与短路判定 |
| 3 | collection 列表 `simple=true` 是否也强制权限过滤 | 影响正确性，建议强制 |

## 16. 结论与后续计划

- 本设计将 collection 权限层收敛为对 main 通用权限 service 的**薄适配层**，唯一核心适配点为**跨类型父级解析**（根 collection → dataset）；
- 对通用 service 的最小扩展：`PerResourceTypeEnum` 加 collection、3 个原语的可选父级参数、`findResourceKeysByCollaboratorsPermission` 加 collection 分支；
- 可见性（列表/平铺/门槛/检索/路径搜索）建立在物化快照直读 + 批量可读解析 + 短路之上；
- 后续工作：按 §4.1 接口清单落地，先适配层（parent/create/collaborators/move/resume/sync）→ 鉴权升级（authDatasetCollection）→ 可见性（list/RAG）→ 并发与迁移。

---

## 附录：关键代码路径

| 用途 | 路径 |
|---|---|
| 通用 service 原语 | `packages/service/support/permission/resourcePermissionService.ts` |
| 通用策略 | `packages/service/support/permission/resourcePermissionPolicy.ts` |
| 通用仓储 | `packages/service/support/permission/repository/resourcePermissionRepo.ts` |
| 通用 controller | `packages/service/support/permission/controller.ts` |
| 兼容层（syncCollaborators/syncChildrenPermission/resumeInheritPermission） | `packages/service/support/permission/inheritPermission.ts` |
| 物化迁移 | `projects/app/src/service/admin/4162/permissionMigration.ts` |
| dataset move 模板 | `projects/app/src/pages/api/core/dataset/update.ts` |
| 通用协作者 API 模板 | `pro/admin/src/service/support/permission/controller.ts` |
| changeOwner | `pro/admin/src/service/core/changeOwner.ts` |
| dataset 鉴权 | `packages/service/support/permission/dataset/auth.ts` |
| collection schema | `packages/service/core/dataset/collection/schema.ts` |
| 资源类型枚举 | `packages/global/support/permission/constant.ts` |
| **新增适配层** | `packages/service/support/permission/collection/`（§5） |
