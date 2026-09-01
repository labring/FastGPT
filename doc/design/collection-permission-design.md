# Collection 文件级权限管理设计文档

> 分支：`feat-collection-permissions-v2` ｜ 基于 main 分支物化权限架构（materialize resource permissions）
>
> 本文档描述 FastGPT knowledge base 下 **collection（文件/文件夹）** 独立于 dataset 的文件级权限维度，建立在 main 已重构的**物化资源权限**架构之上，复用通用权限 service 原语，为 collection 提供薄适配层。
>
> **迭代范围说明**：F016 隐藏路径穿透平铺展示已移出本迭代（待独立需求跟进），本迭代只做列表基础权限过滤（F015）。

## 1. 背景与目标

### 1.1 背景

FastGPT 的权限体系为 team 级资源权限，资源权限记录统一存储于 `resource_permissions` 集合，`resourceType` 枚举当前为 `team / app / dataset / model / agentSkill`——**尚无 `collection`**。当前 collection 的可见性完全由所属 dataset 的权限决定，无法对单个文件/文件夹配置协作者。

main 分支完成了权限架构重构——**物化资源权限（materialize resource permissions）**：

- 每个资源在 `resource_permissions` 中存储其**完整有效 ACL 快照**（含来自祖先继承的部分），读权限、列表过滤、批量可读解析均直接读快照，不再运行时合并父链。
- 提供**通用 service 原语**（`packages/service/support/permission/resourcePermissionService.ts`）：`createResourcePermissions` / `updateResourceCollaborators` / `moveResourcePermissions` / `resumeResourcePermissionInheritance` / `syncResourceTreePermissions`。
- 提供**策略层**（`resourcePermissionPolicy.ts`）：`calculateInheritedResourceCollaborators`（自旧快照剥离父级贡献、反推自身 clbs 再与新父级合并）、`mergeResourceCollaborators`、`toInheritedCollaborators`（父级 owner→manage）、`shouldInheritResourcePermission`。
- 提供**仓储层**（`repository/resourcePermissionRepo.ts`）：`findByResource` / `replaceResource` / `patchResources` / `deleteByResource` / `findResourceKeysByCollaboratorsPermission`（批量可读资源 ID 查询）。

需求要求为 collection 增加：文件级协作者配置、继承/独立态、move/恢复继承/changeOwner、统一鉴权、列表权限过滤、检索（RAG）召回过滤、存量迁移。

**核心原则**：collection 权限层不做平行实现/二次开发，而是**复用通用权限原语**，仅在 collection 的**跨类型父级**（根 collection 的父级是 dataset）这一唯一边界上提供适配。

### 1.2 目标

- 落地 collection 文件级权限功能，满足 NFR-1（10k collections 列表 P95 ≤ 800ms）、NFR-2（批量物化 ≤ 3s）、NFR-7（检索过滤 P95 ≤ 200ms）、NFR-8（越权召回 = 0）。
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
| `hasSetCollectionPermissions` | dataset 级布尔短路标记：该 dataset 下是否存在独立配置的 collection；未置 `true`（`false` 或旧数据 `undefined`）时 collection 可读 == dataset 可读（O(1) 短路） |

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

#### 2.2.3 `datasets` 表

`packages/service/core/dataset/schema.ts`（已有 `inheritPermission`）新增字段：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `hasSetCollectionPermissions` | Boolean | `false` | collection 短路标记 |

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
| D3 | **dataset → collection 传播** | collection 侧导出**跨树 hook** `syncDatasetToCollections`，由 dataset 写路径在同一事务内调用；见 §3.3 |
| D4 | **列表/RAG 过滤** | collection 侧提供 `getReadableCollectionIds`（候选集合限定：一次 `distinct`，`resourceId $in` 候选 + `$or` 协作者 + 查询端 `$bitsAnySet` 过滤），列表/检索共用；见 §7 |
| D5 | **短路标记** | 保留 `hasSetCollectionPermissions`，纯继承态下 O(1) 跳过 O(N) 查询；定位为性能优化 |
| D6 | **并发控制** | **不引入额外并发控制**（N4/S-4 已解除）：依赖 Mongo 事务串行化 + 全量替换幂等，并发覆盖按后写为准（NFR-6）；见 §8 |
| D7 | **迁移** | 扩展 main 的 `permissionMigration` + 新增 `initCollectionPermission` API；见 §12 |
| D8 | **changeOwner** | 扩展 `pro/admin` changeOwner，`changeOwnerType` 增加 `'collection'`，跳过 OutLink 同步；既有 dataset 版级联转移其下 collection 的 owner |

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

另：collection 的**批量可读解析**不依赖通用 repo 的 `findResourceKeysByCollaboratorsPermission`——其按用户 ACL 全量 `distinct`、不支持候选集合 `$in` 限定，10k 级列表/检索下扫描面更大。由 auth.ts 提供候选集合限定的 `getReadableCollectionIds`（§7.1），列表/检索/数据鉴权复用。

### 3.3 dataset → collection 传播（跨树 hook）

根 collection 快照 = `merge(dataset 有效 clbs, 自身 clbs)`。dataset ACL 变更（本 dataset 或继承态祖先 dataset）必须重新物化其下全部 collection 快照（根级直接重物化、folder 递归子树）。通用 service 无法跨类型遍历，由 collection 侧导出：

```
syncDatasetToCollections({ teamId, datasetId, oldEffectiveClbs, newEffectiveClbs, session })
```

- 将受影响 dataset（含继承态后代）的直接子 collection（根级）从 `oldEffectiveClbs` 重新物化到 `newEffectiveClbs`；folder 经 `syncResourceTreePermissions`（collection 类型）递归子树。
- 由 **dataset 写路径**（update move / collaborator update / resume）在**同一事务**内调用，hook 内部自顶向下推导受影响 dataset 子树（新架构下 dataset 快照已物化，"有效 clbs"即快照）。
- dataset 模块耦合为**一个函数调用**。

---

## 4. 修改概述

### 4.1 接口总览

**新增接口：**

| 功能 | 方法 + 路径 | 位置 |
|---|---|---|
| 协作者配置 | `POST /api/proApi/core/dataset/collection/collaborator/update` | fastgpt-pro |
| 协作者列表 | `POST /api/proApi/core/dataset/collection/collaborator/list` | fastgpt-pro |
| 恢复继承 | `POST /api/core/dataset/collection/resumeInheritPermission` | fastgpt-app |
| changeOwner | `POST /api/proApi/core/dataset/collection/changeOwner` | fastgpt-pro |
| collection 权限初始化 | `POST /api/admin/initCollectionPermission` | fastgpt-app admin（`projects/app/src/pages/api/admin/initCollectionPermission.ts`） |
| 列表过滤 | `GET /api/core/dataset/collection/listV2`（改造） | fastgpt-app |

**现有 collection 接口权限升级（CRUD 门槛）：**

| 接口 | 现状 | 目标 |
|---|---|---|
| `POST /api/core/dataset/collection/create` | dataset write | 父 collection folder `write` 或 dataset `write` 及以上；根创建需 dataset `write` |
| `PUT /api/core/dataset/collection/update` | collection write | 非 move：collection `write`；move：源父级 + 目标父级 `manage`（根 ↔ 目录需 `TeamDatasetCreatePermissionVal`），**不接收 `inheritPermission`** |
| `DELETE /api/core/dataset/collection/delete` | collection write | collection `write`（folder 递归删子树） |
| `GET /api/core/dataset/collection/detail` | collection read | dataset `read`（门槛）+ collection `read` |
| `GET /api/core/dataset/collection/listV2` | dataset read | dataset `read`（门槛）；有 `parentId` 时校验该 folder `read`；列表按可读集合逐条过滤 |

**dataset 相关 API 逻辑变更（collection 权限依赖）：**

| 接口 | 变更点 |
|---|---|
| `POST /api/core/dataset/create` | body 新增 `inheritPermission`（默认 true）；`false`=独立创建：仅写 owner 快照、不合并父级 dataset 权限、子树停止传播（对齐 collection 创建 §6.5） |
| `POST /api/core/dataset/createWithFiles` | `datasetParams` 新增 `inheritPermission`，语义同 create |
| `POST /api/core/dataset/folder/create` | body 新增 `inheritPermission`，语义同 create |
| `PUT /api/core/dataset/update`（move） | 保持 dataset 自身继承关系（独立态保持独立、继承态保持继承），不再强制 `inheritPermission=true`；事务内权限传播完成后追加调用 `syncDatasetToCollections`（§5.3） |
| `POST /api/proApi/core/dataset/collaborator/update` | 同上，追加 `syncDatasetToCollections` |
| `POST /api/proApi/core/dataset/resumeInheritPermission` | 同上，追加 `syncDatasetToCollections` |
| `POST /api/proApi/core/dataset/changeOwner` | 转移 dataset 子树 owner 后，级联转移其下 collection 的 owner（文档 `tmbId` + `transferTmbPermissions`，§6.8） |
| dataset schema | 新增 `hasSetCollectionPermissions` 字段；写路径按需置位（`datasetFlag.ts`） |

### 4.2 接口通用约束

- 所有写路径统一 `mongoSessionRun` 事务 + 全量替换幂等（并发覆盖按后写为准，NFR-6）。
- 列表/详情/检索：**先 dataset `read` 门槛，再 collection `read`**；单独的 collection 权限不能绕过 dataset 门槛。
- 协作者接口不可授予 owner，owner 仅由创建默认、changeOwner 产生。

---

## 5. 通用 service 适配层

collection 权限层收敛为 `packages/service/support/permission/collection/` 薄适配层，**仅 5 个文件**：

```
packages/service/support/permission/collection/
├── auth.ts          # 鉴权：authDatasetCollection + 可读 collection 批量解析（列表/检索/数据鉴权复用）
├── controller.ts    # collection API 逻辑：跨类型父级解析、创建/move/恢复继承、syncDatasetToCollections
├── collaborator.ts  # 协作者 API：updateCollectionCollaborators（WithAuth）、协作者列表读取
├── datasetFlag.ts   # hasSetCollectionPermissions 短路标记读写
└── migrate.ts       # 存量迁移（initCollectionPermission）：只信任继承态、独立态保留、无事务幂等收敛
```

### 5.1 跨类型父级解析原语（controller.ts）

```typescript
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

| 场景 | 适配层（controller.ts） | 通用原语（复用） |
|---|---|---|
| 创建（根） | `resolveCollectionParentClbs(..., parentId: null)` → 父级=dataset | `createResourcePermissions`（传 `parentResourceType: dataset, parentResourceId: datasetId`） |
| 创建（folder/非根） | parentId 有值，同类型 | `createResourcePermissions`（默认行为） |
| 更新协作者 | `resolveCollectionParentClbs` → 作为 `parentCollaborators` | `updateResourceCollaborators`（含冲突翻转） |
| 移动 | 独立态：仅更新 `parentId`（不动快照）；继承态：目标父级 = `resolveCollectionParentClbs(targetParentId)`、源父级 = `resolveCollectionParentClbs(sourceParentId)`（根=dataset） | `moveResourcePermissions`（继承态，传 `newParentCollaborators` + `oldParentCollaborators`） |
| 恢复继承 | `resolveCollectionParentClbs` → 传父级覆盖 | `resumeResourcePermissionInheritance` |
| folder 子树同步 | 子节点同类型 | `syncResourceTreePermissions`（默认行为） |
| dataset → collection | 跨树 | `syncDatasetToCollections`（controller.ts，§5.3） |

### 5.3 跨树 hook：`syncDatasetToCollections`（controller.ts）

```typescript
/**
 * dataset 有效 clbs 变更后，将受影响 dataset（含继承态后代）下全部 collection 的快照重新物化：
 * 根级继承态 collection 从 oldEffectiveClbs 物化到 newEffectiveClbs，folder 递归同步子树。
 * 由 dataset 写路径（collaborator/move/resume）在同一事务内调用。
 * 需自顶向下推导受影响 dataset 子树（继承态后代 dataset 的有效 clbs 变化）。
 */
export async function syncDatasetToCollections({
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
4. 对每个受影响 dataset，将其直接子 collection（`parentId: null`）从旧有效 clbs 物化到新有效 clbs，folder 经 `syncResourceTreePermissions`（`resourceType: collection`）递归子树；
5. 批量 diff `patchResources` 写入，幂等。

**dataset 模块集成（最小耦合）**：dataset 写路径在事务内、权限传播完成后追加一行：

```
await syncDatasetToCollections({ teamId, datasetId, oldEffectiveClbs, newEffectiveClbs, session });
```

涉及：`projects/app/src/pages/api/core/dataset/update.ts`（move）、`pro/admin/.../dataset/collaborator/update.ts`、`.../dataset/resumeInheritPermission.ts`。

---

## 6. Collection 权限核心设计

### 6.1 dataset 权限变更如何影响其下 collection

新架构下 dataset 快照已物化，**有效 clbs == 物化快照**。dataset 权限变更的传播：

1. dataset 自身 ACL 变更（collaborator update / move / resume）→ dataset 模块用 `syncResourceTreePermissions` 传播到继承态后代 dataset；
2. collection 侧 hook `syncDatasetToCollections` 在同一事务内，将受影响 dataset（含后代）的全部 collection 快照重新物化（§5.3）。

影响面统一为：**受影响 dataset 的根级继承态 collection 及其子树**。

### 6.2 collection 权限数据模型与不变量

| 不变量 | 说明 |
|---|---|
| 全量物化 | 每个 collection 的 `resource_permissions` 均为完整有效 ACL（含祖先贡献），读路径不递归父链 |
| 继承态 | `inheritPermission=true`：快照 = `merge(父级有效 clbs, 自身 clbs)`；父级 owner 经 `toInheritedCollaborators` 降级为 manage |
| 独立态 | `inheritPermission=false`：快照 = 自身 clbs，不被父级变更覆盖；子树不再传播 |
| owner 唯一 | owner 由创建默认（collection `tmbId`）、changeOwner 产生；协作者接口不可授予 owner；owner 始终保留在自身记录 |
| dataset 门槛 | collection 级可读性必须与 dataset `read` 取 AND（§7.2） |

### 6.3 权限解析：`authDatasetCollection`（auth.ts）

`packages/service/support/permission/dataset/auth.ts` 当前 `authDatasetCollection` 透传 dataset 权限（无 collection 维度），需升级为：

```typescript
// auth.ts
export async function authDatasetCollection({
  req, authToken, authApiKey, collectionId, per, datasetId
}) {
  // 1. dataset read 门槛
  const datasetAuth = await authDataset({ req, authToken, authApiKey, datasetId, per: ReadPermissionVal });
  // 2. 短路：root / team owner / hasSetCollectionPermissions 未置 true（纯继承 → collection 可读 == dataset 可读）
  if (datasetAuth.isRoot || datasetAuth.isTeamOwner) return withCollectionPermission(datasetAuth, { isOwner: true });
  if (datasetAuth.dataset.hasSetCollectionPermissions !== true) return datasetAuth;
  // 3. 物化快照直读 collection 权限（getTmbPermission 语义）
  const { permission } = await getTmbPermission({
    resourceType: PerResourceTypeEnum.collection,
    teamId, tmbId, resourceId: collectionId, per
  });
  if (!permission) return Promise.reject(CollectionErrEnum.unAuthCollection);
  return withCollectionPermission(datasetAuth, { permission });
}
```

物化快照直读，无父链递归。可读 collection 批量解析（`getReadableCollectionIds`，供列表/检索/数据鉴权复用）也置于 auth.ts：候选集合单次 `distinct` 限定（`resourceId $in` 候选 + `$or` 协作者 + 查询端 `$bitsAnySet`），不做 team 全量扫描（§7）。

### 6.4 协作者配置与列表（collaborator.ts）

**协作者配置** `POST /api/proApi/core/dataset/collection/collaborator/update`（fastgpt-pro），流程对齐 dataset 版 `updateResourceCollaboratorsWithAuth`：

```typescript
// collaborator.ts
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

**协作者列表** `POST /api/proApi/core/dataset/collection/collaborator/list`（fastgpt-pro，对齐 dataset 版 `collaborator/list`）：

- 鉴权：目标 collection `read` 及以上；
- 读取该 collection 的物化快照（`getResourceOwnedClbs` / `findByResource`），返回完整有效协作者列表，供前端协作设置弹窗展示。

### 6.5 创建 collection（controller.ts）

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

### 6.6 移动 collection（controller.ts）

`PUT /api/core/dataset/collection/update`（`parentId` 变更即 move），**不接收 `inheritPermission`**——move 以 collection **自身当前继承态**为策略（读 DB 当前值，与 F006 一致）：**独立态保持独立、继承态保持继承**，不允许通过 move 改变继承关系。事务内：

```typescript
if (collection.inheritPermission === false) {
  // 独立态：仅更新 parentId，快照与 inheritPermission=false 保持不变（不合并目标父级）
  await MongoDatasetCollection.updateOne(
    { _id: collection._id },
    { $set: { parentId: targetParentId || null, inheritPermission: false } },
    { session }
  );
  await markDatasetCollectionPermissionsSet({ datasetId: collection.datasetId, session });
  return;
}

// 继承态（含当前无父级的根 collection）：剥离源父级贡献、合并目标父级贡献，保持 inheritPermission=true
const newParentClbs = await resolveCollectionParentClbs({
  teamId, datasetId, parentId: targetParentId, session
});
const oldParentClbs = await resolveCollectionParentClbs({
  teamId, datasetId, parentId: collection.parentId, session // 根（parentId=null）→ dataset 有效 clbs
});
await moveResourcePermissions({
  resource: collection, newParentId: targetParentId,
  resourceModel: MongoDatasetCollection,
  resourceType: PerResourceTypeEnum.collection,
  newParentCollaborators: newParentClbs,
  oldParentCollaborators: oldParentClbs, // 源父级覆盖：folder 快照 / 根→dataset 有效 clbs
  session
});
// folder 移动：moveResourcePermissions 内部经 syncResourceTreePermissions 递归子树
```

`moveResourcePermissions` 内置 `calculateInheritedResourceCollaborators`（剥离旧父级 + 合并新父级）。移动权限校验：源父级 + 目标父级 `manage`；根 ↔ 目录需 `TeamDatasetCreatePermissionVal`（§4.1）。深度校验沿用 `checkMoveFolderDepth`。

### 6.7 恢复继承（controller.ts）

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

**collection 级** `POST /api/proApi/core/dataset/collection/changeOwner`：

- 扩展 `pro/admin/src/service/core/changeOwner.ts`：`changeOwnerType` 增加 `'collection'`；使用 `MongoDatasetCollection` 模型；
- 子资源遍历改为 collection 树（`parentId` 子树）；
- owner 记录更新复用 `transferTmbPermissions`（按资源类型批处理）；
- **跳过 OutLink 同步**（collection 无 OutLink）；
- 同步更新 collection 文档 `tmbId` 字段 + `resource_permissions` owner 记录（owner 唯一不变量）。

**dataset 级** `POST /api/proApi/core/dataset/changeOwner`（既有接口，逻辑变更）：

- 转移 dataset 子树 owner 后，**级联转移其下 collection 的 owner**：`MongoDatasetCollection.updateMany({ teamId, datasetId: { $in: 受影响 datasetIds }, tmbId: oldOwnerId }, { tmbId: newOwnerId })` + `transferTmbPermissions({ resourceType: 'collection', resourceIds: 全部 collection ids })`；
- 全物化快照中每个 collection 快照都含 dataset owner 的继承记录（manage 位），`transferTmbPermissions` 一并覆盖，避免换 owner 后旧 owner 权限残留；
- 仅转移 owner 为 `oldOwnerId` 的 collection；已独立配置为其他 owner 的 collection 保持不变。

---

## 7. 可见性设计

### 7.1 文件列表按权限过滤

`GET /api/core/dataset/collection/listV2`。本迭代不做平铺穿透（F016 移出），按**当前目录直接子节点**过滤 + 分页：

> 搜索模式（传 `searchText`）按名称匹配且忽略 `parentId`（跨目录召回），此时不校验 `parentId` 目录权限；候选查询同样不受目录限定。

1. **候选查询**：进入目录 `parentId`（null = dataset 根），查询该目录直接子 collection 的权限最小字段 `{ _id, parentId, type, inheritPermission, tmbId }`。
2. **短路判定**（任选其一，降序）：
   - 团队管理员/团队所有者：全部可读；
   - `hasSetCollectionPermissions !== true`（false 或旧数据 undefined）且 dataset `read` 通过：全部可读（O(1)）；
   - 其余：`getReadableCollectionIds({ collections: 候选, tmbId, teamId, groupIds, orgIds, datasetPermission })` → 可读 ID 集合。
3. 过滤出可读候选 → MongoDB 排序分页（`sort(updateTime).skip(offset).limit(pageSize)`）→ 当前页完整字段 + 统计回查（`$in` 批量聚合，无 N+1）。`total` = 过滤后该目录下节点数。

`getReadableCollectionIds`（auth.ts）实现：一次 `MongoResourcePermission.distinct('resourceId', { resourceType: collection, teamId, resourceId: { $in: 候选 ids }, permission: { $bitsAnySet: 0b111 }, $or: [tmbId, groupId $in, orgId $in] })`——**以候选集合限定**，查询范围与候选集合同量级；查询端 `$bitsAnySet` 过滤拒绝/无读记录（owner 全位 4294967295 自然命中），返回候选内可读 ID。**不采用**通用 `findResourceKeysByCollaboratorsPermission`：其按用户 ACL 全量 `distinct`、不支持候选 `$in` 限定，10k 级列表下扫描面为团队全量 ACL 足迹（对比见 §3.2）。

> 需先校验当前用户对所属 dataset 有 `read`（§7.2 门槛）；无权限返回空列表。排序分页在过滤后的候选集合上执行（不能在过滤前 `skip/limit`，避免漏掉不可读节点占位导致的分页错位）。

NFR-1（10k collections P95 ≤ 800ms）：候选 `$in` 限定 + 短路 + 过滤后分页达成。

### 7.2 知识库权限门槛

- dataset `read` 是前置门槛：详情、列表、检索均先校验；
- collection `read` 是文件级维度；文件级 read 不能绕过知识库门槛；
- 知识库无 `read` 时知识库及其全部文件均隐藏；
- 列表/详情/检索共用同一"可读 collection 批量解析"函数（`getReadableCollectionIds`，auth.ts），避免"列表可见但点进去无权限"。

### 7.3 检索（RAG）召回权限过滤

检索在 dataset `read` 鉴权通过后，叠加 collection `read` 对召回候选过滤。**授权集合必须在召回查询阶段生效**，不能仅在结果展示时过滤（向量/全文召回本身可能已返回无权限内容）。

流程：

1. **dataset 前置鉴权**：过滤出有 `read` 的 dataset；
2. **解析可读 collection 集合**：`resolveReadableCollectionIds`（auth.ts）输入 `teamId/datasetIds/tmbId` →（工作流检索仅在 `authTmbId` 开启、即存在真实成员身份时调用；未开启则不做 collection 级过滤，按 dataset 全量召回）
   - 团队管理员 / team owner：返回 `undefined`（无 collection 级过滤，按 dataset 召回）；
   - 全部目标 dataset 未配置 collection 权限（flag 非 true，含旧数据 undefined）且 read 通过：返回 `undefined`（短路）；
   - 否则：加载目标 dataset 下**文件类型** collection 最小字段（`type != folder`）→ 按 `datasetId` 分组，**逐 dataset 并行**调用 `getReadableCollectionIds`（各 dataset 独立、候选 `$in` 限定，无 N+1）→ 并集为可读文件 ID；
   - 可读并集覆盖全部文件 collection → 返回 `undefined`（不设 `collectionId IN`，避免上万 ID 长过滤条件）；
   - 真子集 → 返回可读文件 ID 列表（folder 有 read 即其下文件视为可读，属权限解析，非展示平铺）；
   - `undefined` 语义：`decideCollectionFilter` 识别为"无需权限过滤"，不设置 `collectionId IN`，跳过全量判定比较。
3. **合并检索条件**：可读集合 ∩ 用户元数据 collection 条件 ∩ 排除 `forbidCollectionIdList` → `effectiveCollectionIdList`；交集为空直接返回空结果；
4. **决定是否设置 `collectionId` 过滤**：可读集合覆盖该 dataset 全部 collection 时**不设置**（避免上万 ID 的长过滤条件）；真子集时才设置并下沉到向量/全文召回；
5. **结果回查防御**：召回返回 data 后 Mongo 回查再附加 `collectionId IN effectiveCollectionIdList`；
6. **统一覆盖所有检索入口**：工作流 dataset 检索、Agent dataset 检索、search-test、OpenAPI。

NFR-7（P95 ≤ 200ms）：候选 `$in` 限定 + 短路 + `undefined` 不设过滤语义。NFR-8（越权召回 = 0）：授权集合在召回与回查两层生效。

---

## 8. 一致性：事务 + 幂等 + 后写为准

**不引入额外并发控制**（需求 N4/S-4 已解除，不考虑并发覆盖）：

| 保障 | 机制 |
|---|---|
| 原子性 | 所有权限写路径统一 `mongoSessionRun` 事务；权限快照替换与 collection/dataset 文档更新同事务，任一步失败整体回滚（无半写） |
| 幂等 | `resource_permissions` 唯一键 + `replaceResource`/`patchResources` diff 写入，重复执行产生 0 净变更（全量下发天然幂等） |
| 并发写 | 同一资源路径并发写由 Mongo 事务串行化保证不产生损坏数据；语义上**后写为准**（NFR-6） |
| 冲突语义 | 配置协作者与父级冲突（继承态）仍触发 `checkRoleUpdateConflict` → 翻转独立态（这是语义冲突，非并发冲突） |

---

## 9. 可靠性设计

### 9.1 事务边界

- 所有权限写操作（协作者 / move / resume / changeOwner / 初始化/升级）统一 `mongoSessionRun`。
- 权限写与 collection/dataset 文档更新在同一事务。
- 删除 Collection / Collection Folder / Dataset：同一事务内按 `resourceType + resourceId`（`$in`）清理 `resource_permissions`；失败整体回滚，禁止孤儿权限记录（复用 repo `deleteByResource` / `deleteByResources`）。

### 9.2 幂等性

- `resource_permissions` 唯一键 + `replaceResource`/`patchResources` diff 写入：重复执行产生 0 变更。
- 初始化/升级任务带幂等键，可断点续跑。

### 9.3 失败回滚

- 事务异常整体回滚；
- `syncDatasetToCollections` / 初始化产生大量 ops 时按批次 `bulkWrite`（NFR-2，≤3s）。

### 9.4 一致性边界

- 列表、详情、检索共用同一可读解析函数；
- `syncDatasetToCollections` 与 dataset 写路径同事务，避免 dataset 变更成功而根 collection 快照过期。

---

## 10. 性能设计

### 10.1 读性能

- 物化快照：collection 鉴权/列表/检索单表读自身快照，无父链递归；
- 列表/检索 `getReadableCollectionIds` 候选集合单次 `distinct`（`resourceId $in` 候选 + `$or` 协作者 + 查询端 `$bitsAnySet` 过滤），查询范围与候选集合同量级，不做 team 全量扫描；
- 短路：团队管理员 / `hasSetCollectionPermissions` 未置 true（false 或旧数据 undefined）/ 全继承态——O(1) 跳过 distinct 查询。

### 10.2 写性能

- `syncResourceTreePermissions` / `syncDatasetToCollections`：复杂度 O(受影响节点数 × 协作者数)，diff `patchResources` 批量写入；
- folder 深度沿用 `MAX_FOLDER_DEPTH` 限制；
- 大批量物化分批 bulkWrite（NFR-2 ≤ 3s）。

### 10.3 索引建议

- `dataset_collections` 已有 `{ teamId, datasetId, parentId, updateTime }`，支撑列表按目录分页；
- 补 `{ teamId, datasetId, parentId, inheritPermission }` 复合索引（按继承态扫描子树）；
- `resource_permissions` 复用现有 `(teamId, resourceType, resourceId)` 索引（collection 批量 `$in` 命中）。

---

## 11. 边界条件与异常处理

| 场景 | 处理策略 |
|---|---|
| 循环 parentId | `checkMoveFolderDepth` / `checkCreateFolderDepth` 拦截 |
| 移动到根目录 | 目标父级 = dataset 有效 clbs；需 `TeamDatasetCreatePermissionVal` |
| 独立态 collection 被 move | 保持独立态：仅更新 `parentId`，快照与 `inheritPermission=false` 保持不变（不合并目标父级） |
| 父级 owner 在子资源中 | `toInheritedCollaborators` 降级为 manage |
| 根 collection 更新协作者冲突 | 传入 dataset 父级 `parentCollaborators`，通用冲突检测触发 → 翻转独立态 |
| 恢复继承时父级无权限 | 仅保留自身 clbs（含 owner） |
| 删除 Collection / Folder / Dataset | 同事务批量清理 `resource_permissions`（`$in`），失败回滚，无孤儿记录 |
| 只拥有文件权限无知识库权限 | 不展示文件，不展示知识库（dataset 门槛） |
| 并发写同资源 | Mongo 事务串行化 + 后写为准（NFR-6），不做额外并发控制 |
| 升级与用户并发配置 | 幂等键 + 低峰执行 + 后写优先（接受并发覆盖） |

---

## 12. 升级与存量权限迁移

升级前 collection 无独立权限记录，所有存量 collection 按 dataset 权限语义初始化。提供两个入口：**`initCollectionPermission` API**（collection 权限初始化专用，本设计新增）与既有 `upgradePermission`（F010 通用权限重算），二者复用同一套物化同步原语。

### 12.1 `initCollectionPermission` API（新增）

`POST /api/admin/initCollectionPermission`（fastgpt-app admin，`projects/app/src/pages/api/admin/initCollectionPermission.ts`）：

- **鉴权**：系统管理员（root）；`dryRun` 默认 `true`（显式传 `dryRun=false` 才实际写库）；
- **语义**：将存量 collection 物化为 collection 级权限快照——根 collection 以所属 dataset 有效 clbs 为父级、非根以父 collection folder 快照为父级，`merge(父级, [owner])`，folder 递归；**独立态（`inheritPermission=false`）的 collection 保持原 ACL 与继承态不动**，其余 collection 统一回继承态后按 dataset 语义刷新快照；**存在独立态 collection 或 dataset 已置自定义标记时置 `hasSetCollectionPermissions=true`，否则置 `false`（纯继承短路）**；
- **幂等**：迁移只信任 collection 继承态、历史 ACL 不作为判据；待刷新 collection 先清空旧 ACL 再重建 owner 记录（owner 唯一不变量成立），快照按 diff 写入，重复执行结果一致，无需版本号；**不加事务**（迁移幂等收敛、重跑可修复中断残留的部分状态；事务受 `maxCommitTimeMS=60s` 限制，大 dataset 会超时），失败隔离并记录 `datasetId/error`；**支持 `datasetIds` 指定重跑失败/超时的 dataset**，不再按 `limit` 分批（每次处理范围内全部 dataset）；
- **dryRun**：仅校验与统计、不写库；迁移前先分析 parentId 图，存在孤儿（父不存在 / 父不是 folder）或循环即报错，不静默降级；
- **超时**：单次 >3s 转异步任务（对齐 F010 的 W-2 冻结模式）。

### 12.2 初始化流程

1. 校验优先：构建 collection 树查循环引用 / 孤儿 `parentId`，存在即报错退出（数据损坏不应静默降级），dryRun 模式下仅校验并返回将处理数量；
2. 只读前置（不占事务）：加载 dataset 有效 clbs；自顶向下按 `parentId` 层级重建根 collection 快照、folder 递归子树（用 `syncRootCollections` 重建根、`syncResourceTreePermissions` 递归子树——**与运行时同一套原语**；独立态节点被自动跳过）；
3. 待刷新 collection 清空旧 ACL 并重建 owner 记录；独立态 collection 保持原样；
4. 每 dataset 无事务串行执行（幂等收敛、可重跑修复中断残留），失败隔离并记录 `datasetId/error`。

### 12.3 与 `upgradePermission` 的关系

- `upgradePermission`（F010，既有）：权限继承逻辑升级后的全量重算；
- `initCollectionPermission`（新增）：collection 权限维度启用的存量初始化——在既有 dataset 级权限基础上为 collection 物化快照；
- 两者共用 `syncDatasetToCollections` / `syncResourceTreePermissions` / `calculateInheritedResourceCollaborators`，实现一致性（F010 升级完成后校验结果与运行时同步一致）。

---

## 13. 单测覆盖建议

| 模块 | 用例 |
|---|---|
| 跨类型父级解析 | 根（parentId=null → dataset clbs）；非根（→ folder 快照）；独立态（父级读空） |
| 创建 | 根继承态/独立态；folder 递归子树 |
| 协作者更新 | 继承态无冲突（保留自身 clbs）；冲突翻转独立态；根 collection 冲突（dataset 父级） |
| 协作者列表 | 物化快照读取；越权 |
| move | 根→folder；folder→根；独立态移动保持独立（快照与 `inheritPermission=false` 不变）；继承态移动按新父级合并；folder 移动递归子树 |
| 恢复继承 | 保留相对父级独有位；父级无权限仅留自身 clbs |
| 冲突检测 | 修改/删除父级协作者 → 翻转；owner 不可经协作者接口授予 |
| 物化快照 | 各写路径后快照 = merge(父级, 自身)；owner→manage 降级 |
| `getReadableCollectionIds` | 候选限定 `distinct`（`$in` 候选）；`$bitsAnySet` 过滤拒绝记录；短路分支 |
| 短路 | `hasSetCollectionPermissions=false` 时列表/检索短路；团队管理员短路 |
| 列表过滤 | 过滤后分页正确（不可读节点不占位）；无 dataset read 返回空 |
| 初始化 | 存量 collection 物化正确；孤儿/循环校验拒绝；幂等重跑 0 变更；dryRun 不写库 |
| changeOwner | collection 子树 owner 更新；dataset changeOwner 级联 collection owner；无 OutLink 同步 |

## 14. 集成测试覆盖建议

- dataset 权限变更 → 根 collection 快照一致（含继承态后代 dataset）；
- 列表按目录过滤 + 分页：不可读节点剔除后分页无错位、total 正确；
- 越权召回 = 0：向量/全文双引擎 + 回查两层过滤；
- 列表与详情鉴权一致：列表可见即详情可入；
- 初始化（`initCollectionPermission`）幂等、可断点续跑；初始化后与运行时同步结果一致；
- 并发：同资源并发写事务原子、后写为准（无损坏数据）。

---

## 15. 待确认问题

| # | 问题 | 影响 |
|---|---|---|
| 1 | 通用原语父级覆盖参数的命名与放置（`parentResourceType/parentResourceId` vs `parentCollaborators`） | 仅实现细节，不影响架构 |
| 2 | `hasSetCollectionPermissions` 是否与 dataset 权限解析合并为单一判定（是否需要单独字段） | 影响迁移与短路判定 |
| 3 | collection 列表 `simple=true` 是否也强制权限过滤 | 影响正确性，建议强制 |

## 16. 结论与后续计划

- 本设计将 collection 权限层收敛为对 main 通用权限 service 的**薄适配层**（4 个文件），唯一核心适配点为**跨类型父级解析**（根 collection → dataset）；
- 对通用 service 的最小扩展：`PerResourceTypeEnum` 加 collection、3 个原语的可选父级参数；批量可读解析由 collection 侧 `getReadableCollectionIds` 承担（候选集合限定，不扩展通用 repo 的 `findResourceKeysByCollaboratorsPermission`）；
- 可见性（列表/门槛/检索）建立在物化快照直读 + 候选限定批量可读解析 + 短路之上；平铺展示（F016）与当前路径限定搜索已移出本迭代，待独立需求；
- 并发控制不做额外实现（N4/S-4 已解除），依赖事务 + 幂等 + 后写为准；
- 后续工作：按 §4.1 接口清单落地，先适配层（controller/collaborator/auth/datasetFlag）→ 鉴权升级（authDatasetCollection）→ 可见性（list/RAG）→ 初始化迁移（initCollectionPermission）。

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
| **新增适配层（5 文件）** | `packages/service/support/permission/collection/`（§5，含 `migrate.ts`） |
