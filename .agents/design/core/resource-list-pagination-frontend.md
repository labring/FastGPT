# App、Dataset、Skill 列表分页前端改造说明

## 1. 目标与边界

App、Dataset、Skill 列表同时存在两类前端使用场景：

1. Dashboard 主页面展示资源卡片，需要避免一次性拉取整个团队资源，并支持触底加载。
2. 选择器和工具配置弹窗中的当前目录列表可以增量加载；递归资源树和移动目录树继续使用数组协议。

本次采用 V1/V2 分工：

| 场景 | App | Dataset | Skill |
| --- | --- | --- | --- |
| V1 兼容接口 | `/core/app/list` | `/core/dataset/list` | `/core/ai/skill/list` |
| 数组兼容 wrapper | `getAllApps` | `getAllDatasets` | `getAllSkillList` |
| Dashboard 分页接口 | `/core/app/listV2` | `/core/dataset/listV2` | `/core/ai/skill/listV2` |
| Dashboard 分页 wrapper | `getMyAppsV2` | `getDatasetsV2` | `getSkillListV2` |

V1 的 response shape 和现有调用者保持兼容，V2 使用 `{ list, total }`。本次不把 V2 的第一页直接伪装成全量数组。

## 2. 请求 wrapper

### 2.1 App

文件：`projects/app/src/web/core/app/api.ts`

- `getMyApps(data?)` 请求 `/core/app/list`，返回数组。
- `getMyAppsV2(data?)` 请求 `/core/app/listV2`，返回 `{ list, total }`。
- `getAllApps(data?)` 直接复用 `getMyApps(data)`，返回当前筛选条件下的数组。

调用关系：

```text
Dashboard App Context
  -> getMyAppsV2
  -> useScrollPagination
  -> /core/app/listV2

递归树 / 移动弹窗 / 未改造 Tool 选择
  -> getAllApps
  -> getMyApps
  -> /core/app/list

扁平选择列表
  -> useVirtualList
  -> getMyAppsV2
  -> /core/app/listV2
```

旧版 App 接口带 `searchKey` 时保留最多 50 条的历史限制。需要无限搜索结果时，必须另行设计分页选择器，不能通过修改 `getAllApps` 的返回类型解决。

### 2.2 Dataset

文件：`projects/app/src/web/core/dataset/api.ts`

- `getDatasets(data)` 请求 `/core/dataset/list`，返回数组。
- `getDatasetsV2(data)` 请求 `/core/dataset/listV2`，返回 `{ list, total }`。
- `getAllDatasets(data)` 直接复用 `getDatasets(data)`，返回当前筛选条件下的数组。

### 2.3 Skill

文件：`projects/app/src/web/core/skill/api.ts`

- `getSkillList(data)` 请求 `/core/ai/skill/list`。
- `getSkillListV2(data)` 请求 `/core/ai/skill/listV2`。
- `getAllSkillList(data)` 请求旧版 `getSkillList(data)`，取旧接口响应中的 `list` 返回给数组调用者。
- `skillIds` 查询保持不分页，用于校验已关联 Skill 的完整状态。

## 3. Dashboard 分页页面

三个 Dashboard Context 已经使用公共 hook `packages/web/hooks/useScrollPagination.tsx`。该 hook 会：

- 首次请求 `offset=0`。
- 以当前 `data.length` 作为下一页 offset。
- 根据 response 的 `total` 判断是否还有更多数据。
- 在滚动容器接近底部时追加下一页。
- 搜索词、目录或 page size 变化时重新初始化列表。

### 3.1 App Dashboard

页面入口：

- `projects/app/src/pages/dashboard/agent/index.tsx`
- `projects/app/src/pages/dashboard/tool/index.tsx`

复用页面：

- `projects/app/src/pageComponents/chat/ChatTeamApp/index.tsx`

数据 Context：

- `projects/app/src/pageComponents/dashboard/agent/context.tsx`
- `useScrollPagination` 请求 `getMyAppsV2`。
- 参数包括 `parentId`、App 类型、`searchKey`、`offset` 和 `pageSize`。
- `getGridRequestPageSize` 处理首屏预留创建卡片后的请求数量。

列表展示：

- `projects/app/src/pageComponents/dashboard/agent/List.tsx`
- 使用 `ScrollData` 作为滚动容器。
- 使用虚拟网格渲染卡片；虚拟渲染只优化 DOM，不改变分页请求。

移动文件夹：

- `context.tsx` 中的 `getAppFolderList` 保持使用 `getAllApps`。
- `MoveModal` 当前只接受文件夹数组，没有分页协议，不能直接换成 `getMyAppsV2`。

### 3.2 Dataset Dashboard

页面入口：

- `projects/app/src/pages/dataset/list/index.tsx`

数据 Context：

- `projects/app/src/pageComponents/dataset/list/context.tsx`
- `useScrollPagination` 请求 `getDatasetsV2`。
- 参数包括 `parentId`、`searchKey`、`offset` 和 `pageSize`。
- 切换目录或搜索词时重新加载第一页。

列表展示：

- `projects/app/src/pageComponents/dataset/list/List.tsx`
- 使用 `ScrollData` 和虚拟网格。

选择和移动文件夹：

- `projects/app/src/components/core/dataset/SelectModal.tsx` 的 `useDatasetSelect` 使用 `getDatasetsV2` 和 `useScrollPagination`。
- `projects/app/src/components/core/app/DatasetSelectModal.tsx`、`SelectMarkCollection.tsx` 使用 `ScrollData` 和 `useVirtualGridList`。
- `projects/app/src/pageComponents/dataset/list/context.tsx` 的文件夹列表使用 `getAllDatasets`。
- `projects/app/src/web/core/dataset/store/dataset.ts` 无仓库引用，已删除。

### 3.3 Skill Dashboard

页面入口：

- `projects/app/src/pages/dashboard/skill/index.tsx`

数据 Context：

- `projects/app/src/pageComponents/dashboard/skill/context.tsx`
- `useScrollPagination` 请求 `getSkillListV2`。
- 参数包括 `source`、`parentId`、`searchKey`、`offset` 和 `pageSize`。
- 将 API 返回的时间字符串转换为 `Date` 后交给列表展示。

列表展示：

- `projects/app/src/pageComponents/dashboard/skill/List.tsx`
- 使用 `ScrollData` 和虚拟网格。

选择和移动文件夹：

- `projects/app/src/pageComponents/app/detail/Edit/FormComponent/ToolSelector/hooks/useSkillSelectData.ts` 使用 `getSkillListV2` 和 `useScrollPagination`。
- `SkillSelectModal.tsx` 使用 `ScrollData` 和 `useVirtualGridList`。
- `projects/app/src/pageComponents/app/detail/Edit/ChatAgent/hooks/useSkillManager.tsx` 使用 `getAllSkillList` 建立 Skill 映射和目录加载结果。
- `projects/app/src/pageComponents/dashboard/skill/List.tsx` 的移动文件夹列表使用 `getSkillFolderList`，间接使用 `getAllSkillList`。

## 4. 已改为分页的选择列表

### App

以下组件使用 `getMyAppsV2` 和 `useVirtualList`，分页范围为当前目录或当前搜索结果：

- `pageComponents/app/detail/WorkflowComponents/Flow/SelectAppModal.tsx`
- `pageComponents/dashboard/mcp/EditModal.tsx`
- `pageComponents/chat/ChatSetting/HomepageSetting/AddQuickAppModal.tsx`
- `pageComponents/chat/ChatSetting/FavouriteAppSetting/AddFavouriteAppModal.tsx`

Workflow App 选择器采用面包屑加当前目录列表，保留单选和过滤应用 ID 行为。

### Dataset 和 Skill

- Dataset 选择共享 `useDatasetSelect` 的分页状态，两个 Dataset 选择场景使用虚拟网格。
- Dataset 选择弹窗的“全选/取消全选”在明确操作时读取当前目录或搜索条件下的完整候选，保证跨页选择语义；普通列表展示仍使用 V2 分页。
- Skill 选择共享 `useSkillSelectData` 的分页状态，保留目录、搜索、创建/导入和数量限制。
- 搜索词、目录变化会清空已加载页并从 `offset=0` 重新请求。
- 已选项独立维护，当前目录或搜索结果切换不会清除已选项。

## 5. 继续使用全量数组的调用点

### App 直接调用点

| 文件 | 使用场景 | 保留原因 |
| --- | --- | --- |
| `components/Select/AppSelect.tsx` | 通用 App 树选择 | `SelectOneResource.server` 接受数组 |
| `pageComponents/chat/ChatHeader.tsx` | Chat 全部应用目录 | 展开目录时一次渲染当前层级 |
| `web/core/app/api/tool.ts` | Team Tool/Agent 模板 | 对外继续返回模板数组 |

### Dataset 直接调用点

| 文件 | 使用场景 | 保留原因 |
| --- | --- | --- |
| `components/core/app/DatasetSelectModal.tsx` | 全选/取消全选 | 明确操作需要当前条件下的完整候选集 |
| `pageComponents/dataset/list/context.tsx` | 移动 Dataset 文件夹 | `MoveModal.server` 接受数组 |

### Skill 直接调用点

| 文件 | 使用场景 | 保留原因 |
| --- | --- | --- |
| `hooks/useSkillManager.tsx` | ChatAgent Skill 管理 | 需要完整数组构建 Skill 映射 |
| `packages/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin/index.tsx` | PromptEditor Skill 树 | 插件维护递归目录和键盘索引 |
| `dashboard/skill/List.tsx` | 移动 Skill 文件夹 | `MoveModal.server` 接受数组 |

## 6. 当前保留树协议的组件

### `SelectOneResource`

文件：`projects/app/src/components/common/folder/SelectOneResource.tsx`

当前协议：

```ts
server: (props: GetResourceFolderListProps) =>
  Promise<GetResourceListItemResponse[]>
```

每个目录节点展开时请求一次，并直接把返回数组写入 `children`。改为 V2 后需要额外维护每个目录的 `offset`、`total`、加载状态和追加逻辑，属于组件级改造。

### `MoveModal`

文件：`projects/app/src/components/common/folder/MoveModal.tsx`

当前协议：

```ts
server: (props: GetResourceFolderListProps) =>
  Promise<GetResourceFolderListItemResponse[]>
```

移动目录树同样直接渲染完整数组，没有分页游标或加载更多节点。当前继续使用旧版全量接口。

### `ChatHeader`

`ChatHeader` 当前继续使用 `SelectOneResource`。该组件的目录展开是递归 children 数组模型，后续若要分页，需要同时扩展 `SelectOneResource` 的节点级分页状态和加载更多交互。

## 7. 验证清单

### API 与类型

- App V1 返回数组，App V2 返回 `{ list, total }`。
- Dataset V1 返回数组，Dataset V2 返回 `{ list, total }`。
- Skill V1 的旧响应仍由 `getAllSkillList` 转换为数组，Skill V2 供 Dashboard 分页使用。
- V2 在权限过滤后执行 `skip/limit`，并返回匹配总数。
- V2 使用稳定排序，分页追加时不因同一更新时间产生重复或遗漏。

### 前端场景

- Dashboard 三个列表首次只请求一页。
- Dashboard 继续滚动后能追加下一页，直到 `data.length >= total`。
- 搜索和切换目录会清空旧数据并重新请求第一页。
- 树选择器、移动弹窗和 PromptEditor Skill 树仍能获得 V1 数组。
- 扁平选择列表首次只请求一页，继续滚动能追加下一页，直到 `data.length >= total`。
- 扁平选择列表搜索和目录切换会重新请求第一页，跨页已选项保持有效。

### 测试文件

- `projects/app/test/api/core/app/list.test.ts`
- `projects/app/test/api/core/dataset/list.test.ts`
- `projects/app/test/api/core/ai/skill/list.test.ts`

建议执行：

```bash
pnpm --dir projects/app test test/api/core/app/list.test.ts
pnpm --dir projects/app test test/api/core/dataset/list.test.ts
pnpm --dir projects/app test test/api/core/ai/skill/list.test.ts
pnpm --dir projects/app typecheck
```

## 8. 后续独立改造建议

如果后续需要降低选择器的大数据量请求，应单独扩展资源树组件协议，例如：

```ts
type ResourcePage = {
  list: GetResourceListItemResponse[];
  total: number;
};

type ResourceServer = (props: {
  parentId: ParentIdType;
  offset: number;
  pageSize: number;
}) => Promise<ResourcePage>;
```

该改造需要同时处理目录级分页、搜索结果、已选项回显、加载状态和空状态，不能在本次只替换 API wrapper 的范围内完成。
