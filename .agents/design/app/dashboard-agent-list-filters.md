# Agent 工作台列表筛选改造

## 背景

Figma「工作台-Agents」给列表工具栏补了类型、排序、创建者三个交互组件。当前 Agent 页只有搜索 + 文件夹/导入，类型筛在左侧栏二级菜单，列表接口写死 `updateTime: -1`，没有创建者筛选。

本次从 **Agent 列表页** 开始，Tool 列表已按同一套筛选同步。Skill 和批量管理仍不做。

## 已确认需求

1. Agent 左侧栏去掉类型二级菜单，类型改到工具栏下拉。
2. 默认排序「最近修改」，对应 `updateTime` 倒序。
3. App 补 `createTime`。历史数据缺失时，用文档 `_id`（ObjectId）的时间戳回填。
4. 创建者「全部」会清空下方成员多选。清空到 0 人且未点「全部」时，触发器为禁用的「未选择」，Agent 列表为空。
5. 创建者候选项是当前团队全部**活跃**成员。离职成员的资源会转到其他人名下，下拉里不出离职成员。
6. 不实现批量管理，包括入口按钮。
7. Skill 列表的工具栏和侧栏不改。Tool 列表已按 Agent 同一套筛选接入；模板市场分类改到工具栏多选。Agent / Tool / 模板市场写在同一份团队筛选 store 的二级字段里。
8. 筛选不进 URL。类型、排序、创建者走通用过滤器存储；搜索不持久化。存储不绑 dashboard，知识库、日志等以后同一套 hook。
9. 移动端工具栏只保留搜索，三个筛选项和 PC 按钮区按现有习惯收掉。

## 范围

### 做

- Agent / Tool 工具栏：PC 为搜索、类型、排序、创建者，右侧保留文件夹、导入；移动端只留搜索。
- 去掉 `DashboardContainer` 里 Agents、Tools、模板市场分组的类型 children。
- `/api/core/app/list` 增加排序、创建者筛选。
- App 增加 `createTime` 字段、索引、历史回填。
- TagFilter 补单选筛选；筛选状态用通用 `usePersistedFilters`，不绑 dashboard。

### 不做

- 批量管理按钮和批量模式。
- Skill 工具栏与侧栏类型菜单。
- MCP、评测侧栏。
- 卡片上的时间展示（仍用 `updateTime`）。

## 交互约定

工具栏布局：

```text
Agent标题 | 搜索 | 类型 | 排序 | 创建者          文件夹 | 导入
```

三个筛选项共用触发器形态：`label | value | chevron`，展开时触发器描边变蓝。不要新建 `LabeledFilterSelect`，复用已有 TagFilter 触发器，见「复用 TagFilter」。

PC 工具栏展示搜索 + 三个筛选 + 文件夹/导入。移动端只保留搜索。

### 类型

- 选项：全部、工作流、对话 Agent、对话 Agent V2，带现有 `appTypeTagMap` 图标。
- Tool 页类型：全部类型、工作流工具、HTTP 工具、MCP 工具；「全部」请求仍带 toolFolder + 旧版 httpPlugin。
- 单选。选项很少，下拉内不放搜索。
- 触发器 hug，最大 180px；箭头与文案 gap ≥ 8px。现成 `FilterButton` 默认 `maxW=240px`、高度 36px，类型/排序/创建者各自用 props 覆盖最大宽度，高度跟 TagFilter 保持 36px，不另开一套尺寸。
- 菜单按最长文案定宽，且不小于触发器。
- 类型不再写入 `router.query.type`。旧链接上的 `?type=` 忽略，以 localStorage 为准。
- 「全部」时请求类型仍是现有 Agent 集合（folder + simple + workflow + chatAgent）。
- 指定某一类型时，继续带上 folder，避免目录里进不去。

### 排序

| 选项 | 含义 | 接口 |
|---|---|---|
| 最近修改（默认） | `updateTime` 倒序 | `sort=updateTimeDesc` |
| 最近创建 | `createTime` 倒序 | `sort=createTimeDesc` |
| 最早创建 | `createTime` 正序 | `sort=createTimeAsc` |

触发器最小 120px、最大 180px。当前选中项蓝色高亮，「最近修改」右侧标「默认」。

### 创建者

状态机：

| 状态 | 触发器 | 下拉 | 列表请求 |
|---|---|---|---|
| 全部 | `创建者 \| 全部` | 「全部」高亮，checkbox 全空 | 不传 `tmbIds` |
| 已选 N 人 | 1 人显示名字（自己显示「我」）；多人 `第一人 +N`，超长省略 | 对应 checkbox 勾选 | `tmbIds: string[]` |
| 未选择 | `创建者 \| 未选择`，禁用 | checkbox 全空 | `tmbIds: []`，列表为空 |

点击「全部」：清空所有 checkbox，回到「全部」，列表展示全部有权限的 Agent。

从已选成员里把最后一个人也取消：进入「未选择」，Agent 列表为空。再次点「全部」才能恢复。

「全部」不是把所有成员 checkbox 勾上，只是独立的筛选项。

下拉内容：

- 顶部「全部」。
- 全团队成员：checkbox + 头像 + 名字；当前用户右侧标「我」。
- 成员多时出现 32px 搜索框，走团队成员接口的 `searchKey`，列表滚动加载。
- 成员少、无需搜索时，用「全部」和成员之间的分割线，不渲染搜索框。
- 触发器 hug，最大 200px。
- 英文态：「全部」→ All，「我」→ Me。

数据源：`POST /proApi/support/user/team/member/list`，`status=active`。离职成员不出现。若持久化的 `tmbIds` 里有已失效成员，请求前丢掉，避免筛空。

## createTime

### 为什么用 ObjectId 回填

MongoDB ObjectId 前 4 字节就是秒级 Unix 时间，`Types.ObjectId(id).getTimestamp()` 就是文档创建时间。FastGPT 的 App `_id` 都是标准 ObjectId，这个时间对排序足够。

精度是秒，不是毫秒，对「最近/最早创建」没有影响。

### 字段

App Schema 增加：

```ts
createTime: {
  type: Date,
  default: () => new Date()
}
```

和现有 `updateTime` 一样显式字段，不打开 mongoose `timestamps`。新建、复制、导入都会走 default，得到「这次创建」的时间，不会拷贝源应用的 createTime。

类型：`AppStorageSchemaType` / `AppSchemaType` 补 `createTime`。列表项接口暂不返回 createTime，排序在服务端完成。卡片时间仍展示 `updateTime`。

### 索引

现状已有 `{ teamId: 1, updateTime: -1 }`。新增当前索引：

- `{ teamId: 1, createTime: -1 }`

创建者筛选视数据量再决定是否加 `{ teamId: 1, tmbId: 1 }`。先不加，列表查询本身已有 `teamId + parentId` / `teamId + type`。

### 回填

管理员一次性脚本 `/api/admin/4163/initAppCreateTime`（文档豁免 OpenAPI）：

- 条件：`createTime` 不存在或为 null。
- 值：`_id.getTimestamp()`。
- 分批、可重复执行，不覆盖已有 createTime。
- 默认 dry-run，确认后再写。
- `_id` 不是合法 ObjectId 的记录跳过并计数，不猜时间。

新建应用只靠 Schema default，不在每个 `MongoApp.create` 调用点手写。

## 列表 API

`ListAppBodySchema` 增加：

```ts
sort: z.enum(['updateTimeDesc', 'createTimeDesc', 'createTimeAsc']).optional()
tmbIds: z.array(ObjectIdSchema).optional()
```

语义：

- `sort` 缺省 = `updateTimeDesc`。
- `tmbIds` 缺省 / `undefined` = 不按创建者筛。
- `tmbIds: []` = 故意筛空，直接返回 `[]`，不再查库。
- `tmbIds: ['...']` = `tmbId: { $in: tmbIds }`。

`type`、`searchKey`、`parentId` 保持现有语义。搜索仍会打平目录；类型、排序、创建者在搜索结果上继续生效。

## 复用 TagFilter

统一筛选触发器已经在：

```text
packages/web/components/common/TagFilter/
  FilterButton.tsx      # 触发器：title | value | chevron，展开描边
  MultiTagFilter.tsx    # 知识库双栏标签多选
  index.tsx             # 导出 FilterButton、MultiTagFilter
```

业务接入：

- 知识库详情：`projects/app/src/pageComponents/dataset/detail/CollectionCard/DatasetTagFilter.tsx` 包一层 `MultiTagFilter`。
- 系统工具市场的 `TagFilterBox` 是另一套 pill，不复用。

本次：

| 组件 | 放哪 | 干什么 |
|---|---|---|
| `FilterButton` | 已有，直接用 | 类型 / 排序 / 创建者触发器 |
| `SingleSelectFilter` | 补到 `TagFilter/` | 单选下拉，类型和排序用 |
| 创建者下拉 | Agent 页 | 头像、「我」、「全部」独立态，不能塞进双栏 `MultiTagFilter` |

`SingleSelectFilter` 用 `FilterButton` + `MyPopover`，选项支持 icon、右侧附加文案（「默认」）。不要再造一套触发器。

## 过滤器 localStorage

筛选不进 URL。搜索仍是内存 state，刷新清空。

不做成 `useDashboardListFilters`。`packages/web` 不知道团队、也不该依赖 dashboard 路由，底层只负责「按 key 读写 + zod 校验」：

```ts
// packages/web/hooks/usePersistedFilters.ts
usePersistedFilters<T>({
  key: string,
  schema: ZodType<T>,
  defaultValue: T
})
```

- `useLocalStorageState`，`listenStorageChange: true`
- 读出后 `schema.safeParse`，失败回 `defaultValue`，不把脏数据写回去
- `key` 为空或未就绪时不读写，避免登录前落到错误桶

业务侧拼 key，约定：

```text
fastgpt:filters:{teamId}[:{name}[:{resourceId}]]
```

工作台列表只用 `teamId`，页面差异放 value 里。`name` / `resourceId` 留给按资源拆桶的筛选（知识库、日志）：

| 场景 | name | resourceId |
|---|---|---|
| Agent / Tool 列表 | 无 | 无 |
| 以后 Skill 列表 | 无（同一 store 加 `skill`） | 无 |
| 以后知识库文件列表 | `dataset.collection.list` | datasetId |
| 以后应用日志 | `app.logs` | appId |

`projects/app` 提供拼 key 的 helper，不把 teamId 塞进 `packages/web`：

```ts
buildFilterStorageKey({ teamId, name?: string, resourceId?: string })
```

Agent / Tool 列表在 `userInfo.team.teamId` 就绪后再 persist，key 为 `fastgpt:filters:{teamId}`：

```ts
{
  agent: {
    type: 'all' | AppTypeEnum,        // 默认 all
    sort: 'updateTimeDesc' | 'createTimeDesc' | 'createTimeAsc',
    creator: {
      mode: 'all' | 'selected',       // 默认 all
      tmbIds: string[]                // selected 且空数组 = 未选择
    }
  },
  tool: { type, sort, creator },
  templateMarket: {
    mode: 'all' | 'selected',
    tagIds: string[]                 // selected 且空数组 = 未选择，列表为空
  }
}
```

换团队换 key。

社区版不渲染创建者，也不读写 `creator`。`AppListContext` 的 `appType` 改读这份存储里当前页那一层，不再读 `router.query.type`。`loadMyApps` 带上 `sort`、`tmbIds`。

左侧栏：Agents、Tools、模板市场的 `children` 都置空。Skill 的二级菜单不动。

模板市场工具栏：搜索 + 分类多选（交互同创建者，下拉里没有搜索，选项一列）。稿面「全部类型」按「全部」实现。PC 展示分类筛选，移动端只留搜索。原来的应用类型 `MySelect` 去掉，列表始终拉全部类型。有投稿链接时放在分类下拉底部。

## 商业版 / 社区版

成员列表接口在 `proApi`。社区版通常没有多人团队。

本次约定：`feConfigs.isPlus === false` 时不渲染创建者筛选项。社区版工具栏只留搜索、类型、排序。

## i18n

新增文案走 `app` namespace（中文先写，后续按 i18n skill 翻译）：

- 类型、排序、创建者、全部、未选择、我
- 最近修改、最近创建、最早创建、默认
- 搜索（创建者下拉内）

## 测试

局部测试，不跑全量。只测行为契约，不测一行 spread / ObjectId.getTimestamp() 等同义反复：

- `createTime` 回填：非法 id 跳过；dry-run 不写；正式回填不覆盖已有值。
- 列表接口：默认 `updateTime` 倒序；`createTimeDesc`；`tmbIds` 有值 / 空数组。
- `resolveDashboardAppListTypes`：scene；Tool 全部/HTTP/指定类型带 folder 与旧版 httpPlugin；Agent、聊天页。
- 筛选 helper：创建者文案（全部 / 未选择 / 我创建的 / 名字+N）；`toListTmbIds`；脏类型回全部；store 缺省补全。
- `usePersistedFilters`：key 未就绪、非法数据回退。
- `buildFilterStorageKey`：teamId；可选 name / resourceId。
