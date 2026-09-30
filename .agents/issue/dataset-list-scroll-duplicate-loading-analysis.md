# Dataset 页面滚动重复加载 Bug 原因分析

## 问题现象

在知识库列表页面（`/dataset/list`）向下滚动触发分页时：
1. 页面频繁、重复发起加载请求。
2. 列表中出现重复数据项（例如“图片知识库”、“文档知识库”、“用于测试”等被连续重复渲染多次）。
3. 该问题**仅在给定的 MongoDB 数据库**中能够复现，其他开发/测试数据库未复现。

---

## 核心原因定位

经过对数据库实际数据查询与全链路代码追踪，该问题由**后端成员信息填充服务静默丢弃记录导致的分页游标漂移（主要原因）**以及**前端列表渲染条件判断不当（次要原因）**共同导致。

---

### 原因一：后端 `addSourceMember` 静默丢弃记录引发分页偏移量（offset）漂移【根本原因】

#### 1. 数据库数据现状
通过直连该 MongoDB 数据库（`fastgpt` 库）排查：
- Root 团队（teamId: `69c3afad2d2a02204f8239fe`）根目录下共有 **57** 个未删除知识库。
- 排序后（按 `updateTime: -1, _id: -1`）：
  - 索引 0 ~ 42（共 43 个）：`tmbId` 为当前团队有效成员。
  - **索引 43 ~ 53（共 11 个）：`tmbId` 为 `69cf30534a441d4a4aded6b8`**。
  - 索引 54 ~ 56（共 3 个）：`tmbId` 为有效成员（即“图片知识库”、“文档知识库”、“用于测试”）。
- 在 `team_members` 集合中查询发现：**成员 `69cf30534a441d4a4aded6b8` 已被删除，记录不存在**。

#### 2. 后端代码缺陷（`packages/service/support/user/utils.ts`）
在 `addSourceMember` 函数中（第 120-137 行）：
```ts
export async function addSourceMember<T extends { tmbId: string }>({
  list,
  session
}: { ... }) {
  ...
  return list
    .map((item) => {
      const tmb = tmbList.find((tmb) => String(tmb._id) === String(item.tmbId));
      if (!tmb) return; // <--- 关键漏洞：找不到成员信息时直接返回 undefined

      const formatItem = typeof item.toObject === 'function' ? item.toObject() : item;
      return {
        ...formatItem,
        sourceMember: {
          name: tmb.name?.trim() ? tmb.name : 'unknown',
          avatar: tmb.avatar,
          status: tmb.status ?? TeamMemberStatusEnum.active
        }
      };
    })
    .filter(Boolean) as Array<T & { sourceMember: SourceMemberType }>; // <--- 静默过滤掉了该资源！
}
```
当资源关联的 `tmbId` 在 `team_members` 中不存在时，`addSourceMember` 会直接将该记录从 `list` 数组中**静默剔除**。

#### 3. 分页总数与实际返回数不匹配
在 `/api/core/dataset/listV2`（`projects/app/src/pages/api/core/dataset/listV2.ts`）中：
```ts
const [myDatasets, total] = await Promise.all([
  MongoDataset.find(findDatasetQuery).sort(datasetSort).skip(skip).limit(pageSize).lean(),
  MongoDataset.countDocuments(findDatasetQuery)
]);
...
const list = await addSourceMember({ list: formatDatasets });
return GetDatasetListV2ResponseSchema.parse({ list, total });
```
- `total` 通过 `MongoDataset.countDocuments(findDatasetQuery)` 统计，结果为 **57**。
- 但第 1 页（`offset: 0, pageSize: 50`）从 MongoDB 取出 50 条数据后，由于第 43~49 条记录（共 7 条）的 `tmbId` 不存在，被 `addSourceMember` 静默过滤掉，导致接口实际返回的 `list.length` 只有 **43**。

#### 4. 前端基于 `data.length` 的偏移量反复回退（死循环式重复追加）
前端 `useScrollPagination`（`packages/web/hooks/useScrollPagination.tsx`）使用游标分页：
```ts
const offset = init ? 0 : data.length;
```
1. **第 1 次请求**：`offset = 0, pageSize = 50`
   - MongoDB 查询 0..49（50 条）。
   - `addSourceMember` 过滤掉 7 条无成员知识库，返回 43 条有效数据，`total: 57`。
   - 前端接收后，`data.length` 变为 **43**。由于 `43 < 57`，`noMore = false`。
2. **滚动触发第 2 次请求**：前端传入 `offset = data.length = 43`
   - 后端 MongoDB 执行 `.skip(43).limit(50)`。
   - **注意**：MongoDB 并不知道有 7 条数据被过滤掉了，它从数据库内部的第 43 条开始读取（即再次读取了索引 43~56 的数据）。
   - 索引 43~53 的 11 条数据再次被 `addSourceMember` 过滤。
   - 索引 54~56 的 3 条数据（“图片知识库”、“文档知识库”、“用于测试”）**被再次返回**！
   - 前端拼接数据：`43 + 3 = 46`。`46 < 57`，`noMore` 依然为 `false`。
3. **滚动触发第 3 次请求**：`offset = 46`
   - MongoDB `.skip(46).limit(50)`，再次读到索引 54~56 的这 3 条数据并返回！
   - 前端拼接数据：`46 + 3 = 49`。此时这 3 条数据在列表中已经出现 **2 次**。
4. **滚动触发第 4 次请求**：`offset = 49`
   - MongoDB `.skip(49).limit(50)`，再次返回这 3 条数据。前端拼接为 52 条。
5. **滚动触发第 5 次请求**：`offset = 52`
   - MongoDB `.skip(52).limit(50)`，再次返回这 3 条数据。前端拼接为 55 条。
6. **滚动触发第 6 次请求**：`offset = 55`
   - MongoDB `.skip(55).limit(50)`，返回最后 2 条数据。前端拼接为 57 条。
   - 此时 `data.length >= total`（57 >= 57），`noMore` 终于变为 `true`，循环终止。

**结果**：
末尾的 3 个知识库（“图片知识库”、“文档知识库”、“用于测试”）在列表中被重复加载了 **4 ~ 5 次**，且用户稍微一滚动就会连续发出 5 次网络请求。

---

### 原因二：前端组件渲染条件书写不当（次要原因）

在 `projects/app/src/pageComponents/dataset/list/List.tsx`（第 478-508 行）：
```tsx
{isFetchingDatasets ? (
  <Grid ref={gridRef} ...>{renderVirtualGridItems(renderDatasetCard)}</Grid>
) : (
  formatDatasets.length > 0 && (
    <Grid ref={gridRef} ...>{renderVirtualGridItems(renderDatasetCard)}</Grid>
  )
)}
```
对比 `dashboard/agent/List.tsx` 与 `dashboard/skill/List.tsx`：
- Agent 和 Skill 页面使用的是：`{isInitialLoading ? (...) : isEmpty ? (...) : (...)}`。
- 只有 Dataset 页面错误地使用了 `isFetchingDatasets`。
- 在用户滚动到底部触发分页加载时，`isFetchingDatasets` 会从 `false` 变为 `true`，导致 `<Grid>` 结构在两个 JSX 分支间跳变。
- 与此同时，`loadingItemCount` 在加载时动态添加 50 个骨架屏（高度骤增），请求结束后骨架屏移除（高度骤减），如果此时容器触底判定仍然成立，会加速下一页的重复请求。

---

### 为什么“仅在这个数据库里能复现”？

1. **知识库总数阈值（> 50 条）**：
   - 默认每页大小为 50 条（`pageSize: 50`）。
   - 在普通本地开发库中，测试知识库数量通常只有几个到十几个，首屏一次性全部加载完成，`noMore = (data.length >= total) = true`。
   - `noMore` 为 `true` 时，滚动监听器直接 `return`，**根本不会触发滚动加载逻辑**。
   - 而该数据库是之前专门用于 PR 7622 分页功能联调测试的数据库（库内有 `PR7622-分页测试数据` 等专用数据），Root 团队根目录下刚好有 **57** 个知识库，跨过了 50 的分页边界。
2. **存在被删除成员的历史脏数据**：
   - 该数据库中包含大量历史测试残留账号（大量带有 `-delete`、`-deleted` 后缀的用户及被清理的成员）。
   - Root 团队下恰好有 11 个知识库的创建成员已经被物理删除（`69cf30534a441d4a4aded6b8` 不在 `team_members` 中）。
   - 这 11 个孤儿知识库正好位于索引 43~53，横跨在第一页（0~49）和第二页（50~56）的交界处，从而必然触发 `addSourceMember` 的数据丢弃和游标漂移。

---

## 建议修复方案

### 1. 修复 `packages/service/support/user/utils.ts`（根治游标漂移）
`addSourceMember` 不应在找不到 `tmb` 时直接丢弃资源，而应该为找不到成员的资源提供兜底的未知成员信息（`unknown`）：
```ts
export async function addSourceMember<T extends { tmbId: string }>({
  list,
  session
}: {
  list: T[];
  session?: ClientSession;
}): Promise<Array<T & { sourceMember: SourceMemberType }>> {
  if (!Array.isArray(list)) return [];

  const tmbIdList = list
    .map((item) => (item.tmbId ? String(item.tmbId) : undefined))
    .filter(Boolean);
  const tmbList = await MongoTeamMember.find(
    {
      _id: { $in: tmbIdList }
    },
    'tmbId name avatar status',
    {
      session
    }
  ).lean();

  return list.map((item) => {
    const tmb = tmbList.find((tmb) => String(tmb._id) === String(item.tmbId));
    // @ts-ignore
    const formatItem = typeof item.toObject === 'function' ? item.toObject() : item;

    return {
      ...formatItem,
      sourceMember: {
        name: tmb?.name?.trim() ? tmb.name : 'unknown',
        avatar: tmb?.avatar ?? '',
        status: tmb?.status ?? TeamMemberStatusEnum.active
      }
    };
  }) as Array<T & { sourceMember: SourceMemberType }>;
}
```

### 2. 对齐 `projects/app/src/pageComponents/dataset/list/List.tsx` 的渲染条件
将 `isFetchingDatasets` 条件改为与 Agent/Skill 保持一致的 `isInitialLoading`，避免分页加载时的 DOM 分支切换：
```tsx
{isInitialLoading ? (
  <Grid ref={gridRef} ...>{renderVirtualGridItems(renderDatasetCard)}</Grid>
) : (
  formatDatasets.length > 0 && (
    <Grid ref={gridRef} ...>{renderVirtualGridItems(renderDatasetCard)}</Grid>
  )
)}
```
