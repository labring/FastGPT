# 列表筛选

工作台列表和账号 / 日志工具栏共用同一套 `FilterButton`：触发器形态 `label | value | chevron`，展开描边变蓝。本文覆盖两期。

## 共用约定

触发器 hug。单选上限 180px，多选上限 200px。菜单 `w=max-content`，且不窄于触发器，不要把菜单锁成触发器宽度。

多选状态机：

| 状态 | 触发器 | 请求 |
|---|---|---|
| 全部 | `label \| 全部` | 不传该字段 |
| 已选 | 名字胶囊，多人 `+N` | 传选中值 |
| 未选择 | `label \| 未选择` | 传空数组，列表为空 |

「全部」是独立项，不会把所有 checkbox 勾上。从已选里取消最后一项 →「未选择」。

只有会变长、需要查找的列表才传 `showSearch`，传了就一直显示搜索框。封闭短枚举不要传。

组件在 `packages/web/components/common/TagFilter/`：

| 组件 | 干什么 |
|---|---|
| `FilterButton` | 统一触发器 |
| `SingleSelectFilter` | 单选；类型、排序、渠道、模型、状态、粒度 |
| `MultiSelectFilter` | 多选；成员、来源、操作类型、日志用户 |
| `DateRangePicker` 的 `formLabel` | 一体日期触发器：`时间 \| 2026/09/02 - 2026/09/03`，无日历图标 |

系统工具市场的 `TagFilterBox` 是另一套 pill，不复用。

---

## 工作台 Agent / Tool / 模板市场

Figma「工作台-Agents」给列表工具栏补了类型、排序、创建者。原先类型筛在左侧栏二级菜单，列表接口写死 `updateTime: -1`，没有创建者筛选。

从 **Agent 列表页** 开始，Tool、Skill、知识库列表和模板市场分类按同一套筛选同步。批量管理仍不做。

### 已确认需求

1. Agent 左侧栏去掉类型二级菜单，类型改到工具栏下拉。
2. 默认排序「最近修改」，对应 `updateTime` 倒序。
3. App 补 `createTime`。历史数据缺失时，用文档 `_id`（ObjectId）的时间戳回填。
4. 创建者「全部」会清空下方成员多选。清空到 0 人且未点「全部」时，触发器为禁用的「未选择」，Agent 列表为空。
5. 创建者候选项是当前团队全部**活跃**成员。离职成员的资源会转到其他人名下，下拉里不出离职成员。
6. 不实现批量管理，包括入口按钮。
7. Skill 补创建者和排序；知识库补类型、创建者和排序。各页面写在同一份团队筛选 store 的二级字段里。
8. 筛选不进 URL。类型、排序、创建者走通用过滤器存储；搜索不持久化。存储不绑 dashboard，知识库、日志等以后同一套 hook。
9. 移动端工具栏只保留搜索，三个筛选项和 PC 按钮区按现有习惯收掉。

### 2026-09-04 排序修正

1. 知识库的「最近修改」只跟随知识库自身名称、简介、头像和配置等轻量更新，
   不因集合、数据或训练状态变化刷新，避免后台任务频繁改变列表顺序。
2. Skill 与 Agent 保持一致：文件夹和普通资源统一按所选时间混排，不按资源类型预分组。
3. 在文件夹内新建、复制或导入 Skill，以及新建子文件夹时，递归刷新祖先文件夹的 `updateTime`，
   使父级列表能反映目录内容变化。
4. 工作台创建者筛选通过成员列表 API 的 `currentFirst` 选项置顶当前成员；后端在过滤后、分页前排序，
   搜索时只在匹配结果内置顶，前端不再人工补项或重排。

TODO：

- [x] 知识库自身更新时刷新 `updateTime`。
- [x] Skill 列表移除类型优先排序，并补文件夹混排测试。
- [x] Skill 的新建、复制、导入及 Skill 文件夹创建后刷新祖先目录时间。
- [x] 团队成员筛选改为后端分页前置顶并补 API 测试。
- [x] 运行相关局部测试。

### 范围

做：

- Agent / Tool 工具栏：PC 为搜索、类型、排序、创建者，右侧保留文件夹、导入；移动端只留搜索。
- 去掉 `DashboardContainer` 里 Agents、Tools、模板市场分组的类型 children。
- `/api/core/app/list` 增加排序、创建者筛选。
- App 增加 `createTime` 字段、索引、历史回填。
- TagFilter 补单选筛选；筛选状态用通用 `usePersistedFilters`，不绑 dashboard。

不做：

- 批量管理按钮和批量模式。
- Skill 工具栏与侧栏类型菜单。
- MCP、评测侧栏。
- 卡片上的时间展示（仍用 `updateTime`）。

### 交互

```text
Agent标题 | 搜索 | 类型 | 创建者 | 排序          文件夹 | 导入
```

PC 展示搜索 + 三个筛选 + 文件夹/导入。移动端只保留搜索。

#### 类型

- Agent：全部、工作流、对话 Agent、对话 Agent V2，带现有 `appTypeTagMap` 图标。
- Tool：全部、工作流工具、HTTP 工具、MCP 工具；「全部」请求仍带 toolFolder + 旧版 httpPlugin。
- 单选。选项很少，下拉内不放搜索。
- 类型不再写入 `router.query.type`。旧链接上的 `?type=` 忽略，以 localStorage 为准。
- 「全部」时请求类型仍是现有 Agent 集合（folder + simple + workflow + chatAgent）。
- 指定某一类型时，继续带上 folder，避免目录里进不去。

#### 排序

| 选项 | 含义 | 接口 |
|---|---|---|
| 最近修改（默认） | `updateTime` 倒序 | `sort=updateTimeDesc` |
| 最近创建 | `createTime` 倒序 | `sort=createTimeDesc` |
| 最早创建 | `createTime` 正序 | `sort=createTimeAsc` |

触发器最小 120px、最大 180px。当前选中项蓝色高亮，「最近修改」右侧标「默认」。

#### 创建者

| 状态 | 触发器 | 下拉 | 列表请求 |
|---|---|---|---|
| 全部 | `创建者 \| 全部` | 「全部」高亮，checkbox 全空 | 不传 `tmbIds` |
| 已选 N 人 | 1 人显示名字（自己显示「我」）；多人 `第一人 +N`，超长省略 | 对应 checkbox 勾选 | `tmbIds: string[]` |
| 未选择 | `创建者 \| 未选择`，禁用 | checkbox 全空 | `tmbIds: []`，列表为空 |

点击「全部」：清空所有 checkbox，回到「全部」。从已选成员里把最后一个人也取消：进入「未选择」，列表为空。再次点「全部」才能恢复。

下拉内容：

- 顶部「全部」。
- 全团队成员：checkbox + 头像 + 名字；当前用户右侧标「我」。
- 下拉里一直有 32px 搜索框，走团队成员接口的 `searchKey`，列表滚动加载。
- 英文态：「全部」→ All，「我」→ Me。

数据源：`POST /proApi/support/user/team/member/list`，`status=active`。离职成员不出现。若持久化的 `tmbIds` 里有已失效成员，请求前丢掉，避免筛空。

创建者下拉带头像、「我」、「全部」独立态，走 `TeamMemberFilter` → `MultiSelectFilter`，不能塞进双栏 `MultiTagFilter`。只选自己时触发器显示「我创建的」。

### createTime

MongoDB ObjectId 前 4 字节就是秒级 Unix 时间，`Types.ObjectId(id).getTimestamp()` 就是文档创建时间。精度是秒，对「最近/最早创建」没有影响。

App Schema 增加显式 `createTime`（和 `updateTime` 一样，不打开 mongoose `timestamps`）。新建、复制、导入走 default，得到「这次创建」的时间，不会拷贝源应用的 createTime。

类型：`AppStorageSchemaType` / `AppSchemaType` 补 `createTime`。列表项接口暂不返回 createTime，排序在服务端完成。卡片时间仍展示 `updateTime`。

现状已有 `{ teamId: 1, updateTime: -1 }`。新增当前索引 `{ teamId: 1, createTime: -1 }`。创建者筛选先不加 `{ teamId: 1, tmbId: 1 }`。

V4.17.0 自动升级任务 `20260903_backfill_app_create_time`：

- 位于 `projects/app/src/migration/tasks/4170/`，只在注册表末尾追加。
- 以 `_id.getTimestamp()` 为权威创建时间，只回填 `createTime` 不存在或为 null 的记录。
- 按固定 ObjectId 上界和 checkpoint 分批执行，写入使用 CAS，可安全重放且不覆盖已有值。
- `_id` 不是合法 ObjectId 的记录保留原状并在最终结果计数，不猜测时间。
- 为非阻塞任务；失败数据在管理页修复后可单独重试，不阻断后续升级任务。
- 主快照完成后再扫描仍缺少 `createTime` 的 App，覆盖滚动升级期间旧节点的新写入。

新建应用只靠 Schema default，不在每个 `MongoApp.create` 调用点手写。

### 列表 API

`ListAppBodySchema` 增加：

```ts
sort: z.enum(['updateTimeDesc', 'createTimeDesc', 'createTimeAsc']).optional()
tmbIds: z.array(ObjectIdSchema).optional()
```

- `sort` 缺省 = `updateTimeDesc`。
- `tmbIds` 缺省 / `undefined` = 不按创建者筛。
- `tmbIds: []` = 故意筛空，直接返回 `[]`，不再查库。
- `tmbIds: ['...']` = `tmbId: { $in: tmbIds }`。

`type`、`searchKey`、`parentId` 保持现有语义。搜索仍会打平目录；类型、排序、创建者在搜索结果上继续生效。

### 过滤器 localStorage

筛选不进 URL。搜索仍是内存 state，刷新清空。

`packages/web` 不知道团队、也不该依赖 dashboard 路由，底层只负责「按 key 读写 + zod 校验」：

```ts
usePersistedFilters<T>({
  key: string,
  schema: ZodType<T>,
  defaultValue: T
})
```

- `useLocalStorageState`，`listenStorageChange: true`
- 读出后 `schema.safeParse`，失败回 `defaultValue`，不把脏数据写回去
- `key` 为空或未就绪时不读写，避免登录前落到错误桶

业务侧拼 key：`fastgpt:filters:{teamId}[:{name}[:{resourceId}]]`

工作台列表只用 `teamId`，页面差异放 value 里。`name` / `resourceId` 留给按资源拆桶的筛选：

| 场景 | name | resourceId |
|---|---|---|
| Agent / Tool 列表 | 无 | 无 |
| Skill / 知识库列表 | 无（同一 store 加各自二级字段） | 无 |
| 以后知识库文件列表 | `dataset.collection.list` | datasetId |
| 以后应用日志 | `app.logs` | appId |

`projects/app` 提供 `buildFilterStorageKey`，不把 teamId 塞进 `packages/web`。Agent / Tool 列表在 `userInfo.team.teamId` 就绪后再 persist，key 为 `fastgpt:filters:{teamId}`：

```ts
{
  agent: {
    type: 'all' | AppTypeEnum,
    sort: 'updateTimeDesc' | 'createTimeDesc' | 'createTimeAsc',
    creator: {
      mode: 'all' | 'selected',
      tmbIds: string[]                // selected 且空数组 = 未选择
    }
  },
  tool: { type, sort, creator },
  skill: { sort, creator },
  dataset: { type, sort, creator },
  templateMarket: {
    mode: 'all' | 'selected',
    tagIds: string[]                 // selected 且空数组 = 未选择
  }
}
```

换团队换 key。社区版不渲染创建者，也不读写 `creator`。`AppListContext` 的 `appType` 改读这份存储里当前页那一层，不再读 `router.query.type`。`loadMyApps` 带上 `sort`、`tmbIds`。

左侧栏：Agents、Tools、Skill、模板市场的 `children` 都置空。

模板市场工具栏：搜索 + 分类多选（交互同创建者，下拉里没有搜索，选项一列）。稿面「全部类型」按「全部」实现。PC 展示分类筛选，移动端只留搜索。原来的应用类型 `MySelect` 去掉，列表始终拉全部类型。有投稿链接时放在分类下拉底部。

`feConfigs.isPlus === false` 时不渲染创建者。社区版工具栏只留搜索、类型、排序。

### i18n

新增文案走 `app` namespace（中文先写，后续按 i18n skill 翻译）：类型、排序、创建者、全部、未选择、我、最近修改、最近创建、最早创建、默认、搜索（创建者下拉内）。

### 测试

局部测试，不跑全量。只测行为契约：

- `createTime` 回填：非法 id 跳过；dry-run 不写；正式回填不覆盖已有值。
- 列表接口：默认 `updateTime` 倒序；`createTimeDesc`；`tmbIds` 有值 / 空数组。
- `resolveDashboardAppListTypes`：scene；Tool 全部/HTTP/指定类型带 folder 与旧版 httpPlugin；Agent、聊天页。
- 筛选 helper：创建者文案（全部 / 未选择 / 我创建的 / 名字+N）；`toListTmbIds`；脏类型回全部；store 缺省补全。
- `usePersistedFilters`：key 未就绪、非法数据回退。
- `buildFilterStorageKey`：teamId；可选 name / resourceId。

---

## 账号、日志、模型、API 密钥

把仍是「左边文案 + 右边 MultipleSelect / MySelect」的页面，换成工作台同一套触发器。筛选仍是页面状态，不进 URL，也不写入工作台那份 `fastgpt:filters:{teamId}` store。

### 页面

| 页面 | 筛选项 | 备注 |
|---|---|---|
| 使用记录 | 时间、成员、来源 | 时间走 `DateRangePicker` `formLabel` |
| 团队操作日志 | 成员、操作类型 | |
| 应用日志 / 聊天设置日志 | 时间、来源、用户 | 用户「未选择」鉴权后返回空列表 |
| 模型日志 / 模型监控 | 时间、渠道、模型、状态 / 时间粒度 | |
| 运营后台审计 | 操作人员、操作类型 | |
| 可用模型 / 模型配置 | 提供商、模型类型 | 提供商要搜索；类型是封闭枚举 |
| API 密钥 | 标签、排序 | 标签**只换触发器**，弹层保留搜索 / 新建 / 管理 |

图表内部粒度下拉、搜索框本身不改。

### 搜索策略

| 筛选项 | 搜索 |
|---|---|
| 成员 / 日志用户 | 要，团队成员走接口搜索 |
| 操作类型 | 要，事件很多 |
| 渠道 / 模型 / 提供商 | 要，动态长列表 |
| 来源 / 状态 / 时间粒度 / 模型类型 / 排序 | 不要，封闭短枚举 |

成员列表用 `TeamMemberFilter`（分页 + 接口搜索，一直出搜索框）。工作台创建者直接用它，只是触发器在只选自己时显示「我创建的」。
