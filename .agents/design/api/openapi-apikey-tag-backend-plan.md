# API Key 标签改造方案

## 背景

API Key 已从应用级 Key 调整为全局 Key，Key 数量增长后需要新的管理维度。用户仍需要通过标签管理 Key 的使用场景，同时历史应用级 Key 需要保留“原来属于哪个应用”的可见线索。

本方案覆盖后端 API、数据模型、兼容逻辑和前端展示约定。`openapi.appId` 保留，不改变现有鉴权和 completions 兼容语义。

## 目标

### P0

1. API Key 支持绑定多个标签。
2. 支持标签 CRUD：创建、列表、更新、删除。
3. API Key create/update 接受 `tags` 字段创建或更新标签绑定。
4. API Key list 返回标签信息。
5. API Key list 支持按标签筛选。
6. API Key list 支持按 Key 名称搜索。
7. 暂不内置系统标签，新成员标签列表初始为空。
8. 历史带 `appId` 的 API Key 记录应用名到 `appName` 字段，并在 list 返回。
9. API Key list 接受 `appId`，把相同 `appId` 的 Key 排在前面，但不改变可见范围，也不作为过滤条件。
10. 前端在名称下方展示标签；如果返回 `appName`，自动补一个特殊标签并排在第一个。

### P1

1. 标签列表返回每个标签下的 Key 数量。

### P2

1. 支持批量给 Key 增删标签。
2. 支持批量删除长期未使用 Key。
3. 支持标签合并，方便用户整理重复标签。

## 最终方案摘要

1. 后端新增 `openapi_tags` 集合管理标签，API Key 文档新增 `tagIds` 保存绑定关系。
2. API Key create/update 接受 `tags` 字段，服务端校验标签归属后写入 `tagIds`。
3. API Key list 支持按 `keyword` 搜索 Key 名称，支持按 `tags` 进行多标签筛选。
4. 不提供无标签筛选。
5. 标签 CRUD 独立为 `/api/support/openapi/tag/*`，只允许登录态调用。
6. 不再自动创建默认系统标签；历史 `type='system'` 标签保留兼容，但按普通标签允许编辑和删除。
7. 历史带 `appId` 的 Key 增加 `appName` 展示字段，由迁移脚本回填；list 只读取快照字段，不实时查询应用。
8. API Key list 接受 `appId`，只用于把相同 `appId` 的历史 Key 排前，不过滤其他 Key。
9. 前端在表格上方新增搜索、标签筛选、标签管理入口。
10. 表格在名称下方展示标签，`appName` 作为第一个特殊标签；最多显示 3 个标签，超出用 `+N` 收起。
11. UI 参考知识库标签管理交互，但 API Key 单独实现一套组件，不复用知识库标签业务组件。

## 设计原则

1. 标签是 API Key 管理元数据，不参与开放接口鉴权。
2. 标签不影响 `authProxy`、限额、用量统计、复制、健康检查和现有 `appId` 兼容行为。
3. `appName` 只做历史应用名展示，不参与鉴权，不替代 `appId`。
4. API Key 当前按登录成员本人 `tmbId` 管理，标签也按 `{ teamId, tmbId }` 隔离。
5. Key 文档只存 `tagIds`，标签名称、排序、类型放在独立标签表中，便于重命名和统计。
6. API 入参使用 `tags` 表达标签绑定；服务端内部转换为 `tagIds` 存储。
7. `appName` 展示标签是前端展示层在标签列自动补充的特殊标签，不写入标签表，也不写入 `tagIds`。

## 数据模型

### 标签集合

新增目录：

```text
packages/service/support/openapi/tag/
├── schema.ts
├── entity.ts
└── service.ts
```

新增集合：`openapi_tags`。

建议字段：

```ts
type OpenApiTagSchema = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  normalizedName: string;
  type: 'system' | 'custom';
  order: number;
  createTime: Date;
  updateTime: Date;
};
```

字段说明：

- `teamId`：团队 ID。
- `tmbId`：团队成员 ID，与现有 API Key 管理范围一致。
- `name`：标签展示名。
- `normalizedName`：标签名规范化值，用于同一成员下去重。建议规则为 `trim().toLowerCase()`。
- `type`：历史兼容字段。新标签均写入 `custom`；旧数据可能存在 `system`，当前按普通标签处理。
- `order`：排序值。新建标签默认放在当前列表最前面，用户可在标签管理中拖拽排序。
- `createTime` / `updateTime`：创建和更新时间。

索引：

```ts
OpenApiTagSchema.index({ teamId: 1, tmbId: 1, normalizedName: 1 }, { unique: true });
OpenApiTagSchema.index({ teamId: 1, tmbId: 1, type: 1, order: 1 });
```

### API Key 集合扩展

在 `packages/service/support/openapi/schema.ts` 的 `OpenApiSchema` 增加：

```ts
tagIds: {
  type: [Schema.Types.ObjectId],
  default: []
},
appName: {
  type: String
}
```

字段说明：

- `tagIds`：Key 绑定的标签 ID。
- `appName`：历史带 `appId` 的应用级 Key 对应应用名。该字段是展示快照，不参与鉴权。

对应共享类型 `packages/global/support/openapi/type.ts` 增加：

```ts
tagIds?: string[];
appName?: string;
```

建议索引：

```ts
OpenApiSchema.index({ teamId: 1, tmbId: 1, tagIds: 1, _id: -1 });
OpenApiSchema.index({ teamId: 1, tmbId: 1, appId: 1, _id: -1 });
OpenApiSchema.index({ teamId: 1, tmbId: 1, name: 1 });
```

`name` 模糊搜索如果使用正则，普通索引只能有限辅助。P0 可先接受；如果后续 Key 数量继续增长，再考虑增加 `normalizedName` 或搜索索引。

## 兼容设计

### appName 补全

历史 API Key 如果有 `appId`，需要记录对应应用名到 `openapi.appName`。

采用迁移脚本一次性补全，不在 `GET /support/openapi/list` 中实时查询应用：

1. `GET /support/openapi/list` 只读取 `openapi.appName` 快照字段。
2. 如果历史 Key 缺失 `appName`，list 直接返回空，不临时查询 `MongoApp`。
3. 缺失数据通过管理员迁移脚本补齐。
4. 如果应用不存在，迁移脚本保持 `appName` 为空，不阻塞列表。

设计原因：

- 不改变 `openapi.appId`。
- list 是高频接口，不能因为历史兼容字段引入跨集合实时查询和写回。
- `appName` 是历史展示快照，允许通过迁移脚本异步补齐，不影响 API Key 鉴权和使用。

发布时新增管理员脚本 `projects/app/src/pages/api/admin/initv4151.ts` 做一次性全量回填：

1. 需要 root 权限调用。
2. 分页扫描 `appId` 存在且 `appName` 缺失的 `openapi` 记录。
3. 批量查询 `MongoApp` 获取应用名。
4. 使用 `bulkWrite` 写入 `openapi.appName`。
5. 脚本可重复执行，不覆盖已有 `appName`。
6. 如果 `appId` 无效或应用不存在，跳过并计数，不修改 `appId`。
7. 脚本只做 `appName` 回填，不处理标签、不修改标签绑定。

### list appId 排序

`GET /support/openapi/list` 接受 `appId`：

- 只用于排序，不用于过滤。
- 不扩大现有可见范围，仍然只返回当前登录成员本人 Key。
- 匹配 `openapi.appId === query.appId` 的 Key 排在前面。
- 其他排序保持 `_id desc` 或当前创建时间倒序。
- 如果同时传 `keyword`、`tags`，先按这些条件筛选，再在结果集内按 `appId` 置前。

当前 `OPENAPI_KEY_MAX_COUNT` 是成员级数量限制，列表结果规模有限，P0 可以在应用层排序；后续如果数量限制变大，再改为 aggregation 排序。

## OpenAPI Schema 调整

API Key 相关接口也必须同步 OpenAPI 文档。`list/create/update` 的新增字段，以及标签
`list/create/update/delete` 接口，需要在 `packages/global/openapi/support/openapi/` 下补齐
zod schema、route 声明和 OpenAPI 路由注册；不能只实现
`projects/app/src/pages/api/...` 路由。

### 标签结构

建议新增文件：

```text
packages/global/openapi/support/openapi/tag.ts
```

定义：

```ts
export const OpenApiTagTypeSchema = z.enum(['system', 'custom']);

export const OpenApiTagSchema = z.object({
  _id: ObjectIdSchema.meta({ example: '68ad85a7463006c963799a05', description: '标签 ID' }),
  name: z.string().meta({ example: '客户 A', description: '标签名称' }),
  type: OpenApiTagTypeSchema.meta({
    example: 'custom',
    description: '标签类型；system 仅用于兼容历史数据，新标签均为 custom'
  }),
  order: z.number().meta({ example: 10, description: '排序值' }),
  createTime: z.coerce.date().meta({ description: '创建时间' }),
  updateTime: z.coerce.date().meta({ description: '更新时间' }),
  keyCount: z.number().optional().meta({ example: 12, description: '绑定该标签的 API Key 数量' })
});

export type OpenApiTagType = z.infer<typeof OpenApiTagSchema>;
```

标签 ID 入参复用：

```ts
export const OpenApiTagsInputSchema = z
  .array(ObjectIdSchema)
  .max(20)
  .meta({ description: '标签 ID 列表' });
```

### API Key 返回结构

文件：`packages/global/openapi/support/openapi/api.ts`

扩展 `OpenApiKeySchema`：

```ts
appName: z.string().optional().meta({
  example: '客服助手',
  description: '历史应用级 API Key 对应应用名，仅用于展示'
}),
tagIds: z
  .array(ObjectIdSchema)
  .default([])
  .meta({ description: 'API Key 绑定的标签 ID 列表' }),
tags: z
  .array(OpenApiTagSchema)
  .default([])
  .meta({ description: 'API Key 绑定的标签列表' })
```

### 创建 API Key

`CreateApiKeyBodySchema` 增加：

```ts
name: z.string().min(1).max(50).meta({
  example: '客户 A Key',
  description: 'API Key 名称'
}),
tags: OpenApiTagsInputSchema.optional().meta({
  example: ['68ad85a7463006c963799a05'],
  description: '绑定的标签 ID 列表'
})
```

语义：

- 不传 `tags`：创建无标签 Key。
- 传空数组：创建无标签 Key。
- 传标签 ID：必须全部属于当前 `{ teamId, tmbId }`。
- `tags` 只处理标签绑定，不创建标签；新标签必须先调用 tag create API。

### 更新 API Key

`UpdateApiKeyBodySchema` 增加 `tags`，并把 refine 调整为：

```ts
name !== undefined ||
limit !== undefined ||
authProxy !== undefined ||
tags !== undefined
```

语义：

- `tags` 出现时整体替换标签绑定。
- `tags: []` 表示清空标签。
- 不传 `tags` 表示不修改标签。

### 获取 API Key 列表

`GetApiKeyListQuerySchema` 增加：

```ts
keyword: z.string().trim().max(100).optional().meta({
  example: 'production',
  description: '按 API Key 名称搜索'
}),
tags: z
  .union([ObjectIdSchema, z.array(ObjectIdSchema)])
  .optional()
  .meta({
    example: ['68ad85a7463006c963799a05'],
    description: '按标签筛选；多个标签默认要求同时包含'
  }),
appId: ObjectIdSchema.optional().meta({
  example: '68ad85a7463006c963799a05',
  description: '应用 ID，仅用于把相同 appId 的历史 Key 排在前面'
}),
sortBy: z.enum(['createTime', 'lastUsedTime', 'remainingPoints']).default('createTime').meta({
  example: 'createTime',
  description: '排序字段；appId 置顶优先级最高，同一组内再按该字段排序'
})
```

筛选与排序语义：

- `keyword` 只匹配 `name`，不匹配明文 `apiKey`。
- `tags` 使用 `$all`，多个标签表示同时包含。
- `appId` 只排序，不过滤，且永远是最高优先级。
- `sortBy` 默认 `createTime`，可选 `lastUsedTime`、`remainingPoints`；同一 appId 置顶组内，时间越近越靠前，剩余积分越少越靠前。
- `remainingPoints = limit.maxUsagePoints - usagePoints`；不限额 Key 按无限剩余处理。

## 标签 CRUD API

### 路由

新增：

```text
GET    /api/support/openapi/tag/list
POST   /api/support/openapi/tag/create
PUT    /api/support/openapi/tag/update
DELETE /api/support/openapi/tag/delete
```

全部使用登录态鉴权，不支持 API Key 鉴权。

每个标签接口都需要在 OpenAPI 中声明 method、path、summary、tags、query/body/response
schema，并和 API Key 接口归到同一组开放平台管理文档下。

### 获取标签列表

```ts
export const GetOpenApiTagListQuerySchema = z.object({
  withKeyCount: BoolSchema.optional().meta({
    example: false,
    description: '是否返回每个标签绑定的 API Key 数量'
  })
});

export const GetOpenApiTagListResponseSchema = z.array(OpenApiTagSchema);
```

行为：

1. 鉴权获取当前 `teamId`、`tmbId`。
2. 返回当前成员标签，不自动创建默认标签。
3. P1 如果 `withKeyCount=true`，聚合统计每个标签绑定的 Key 数量。

### 创建标签

```ts
export const CreateOpenApiTagBodySchema = z.object({
  name: z.string().trim().min(1).max(50).meta({
    example: '客户 A',
    description: '标签名称'
  })
});

export const CreateOpenApiTagResponseSchema = OpenApiTagSchema;
```

行为：

- 创建 `type='custom'` 标签。
- 同一 `{ teamId, tmbId }` 下 `normalizedName` 唯一。

### 更新标签

```ts
export const UpdateOpenApiTagBodySchema = z.object({
  tagId: ObjectIdSchema.meta({ description: '标签 ID' }),
  name: z.string().trim().min(1).max(50).optional().meta({ description: '标签名称' }),
  order: z.number().int().nonnegative().optional().meta({ description: '排序值' })
});

export const UpdateOpenApiTagResponseSchema = z.undefined().meta({ description: '更新成功' });
```

行为：

- 只能更新当前成员自己的标签。
- 历史 `type='system'` 标签按普通标签处理，允许重命名和排序。
- 更新名称时校验重名。

### 删除标签

```ts
export const DeleteOpenApiTagQuerySchema = z.object({
  tagId: ObjectIdSchema.meta({ description: '标签 ID' })
});

export const DeleteOpenApiTagResponseSchema = z.undefined().meta({ description: '删除成功' });
```

行为：

1. 校验标签属于当前成员。
2. 删除标签后，从当前成员所有 Key 中 `$pull: { tagIds: tagId }`。
3. 历史 `type='system'` 标签按普通标签处理，允许删除。
4. 不删除任何 API Key。

## 服务层设计

新增 `packages/service/support/openapi/tag/service.ts`。

核心函数：

```ts
/**
 * 校验标签归属并返回去重后的标签 ID。
 *
 * API Key 当前按 tmbId 隔离管理，因此标签也必须属于同一个 teamId + tmbId。
 */
export async function validateOpenApiTags(props: {
  teamId: string;
  tmbId: string;
  tags: string[];
}) {}

/**
 * 根据查询条件获取 API Key 标签，并按 tagId 组织成 Map，供列表接口组装 tags 字段。
 */
export async function getOpenApiTagMap(props: {
  teamId: string;
  tmbId: string;
  tagIds: string[];
}) {}
```

当前不提供默认标签初始化函数，新成员标签列表初始为空。

## API Key CRUD 改造

### create

文件：`projects/app/src/pages/api/support/openapi/create.ts`

流程：

1. `parseApiInput` 解析 `tags`。
2. `authUserPer` 保持现有创建权限。
3. 如果传入 `tags`，调用 `validateOpenApiTags`。
4. 创建 `MongoOpenApi` 时写入去重后的 `tagIds`。

### update

文件：`projects/app/src/pages/api/support/openapi/update.ts`

流程：

1. `parseApiInput` 解析 `tags`。
2. `authOpenApiKeyCrud` 保持现有本人 Key 权限。
3. 如果传入 `tags`，调用 `validateOpenApiTags`。
4. `findByIdAndUpdate` 增加 `tagIds` 整体替换。
5. 审计日志继续使用 `UPDATE_API_KEY`，可在 params 中记录标签数量变化。

### list

文件：`projects/app/src/pages/api/support/openapi/list.ts`

流程：

1. `parseApiInput` 解析 `keyword`、`tags`、`appId`、`sortBy`。
2. `authUserPer` 获取 `teamId`、`tmbId`。
3. 基于 `{ teamId, tmbId }` 构造查询条件。
4. `keyword` 转义后用于 `name` 正则搜索。
5. `tags` 使用 `$all` 过滤。
6. 直接使用 `openapi.appName` 快照字段，不在 list 中查询 `MongoApp` 或回填 `appName`。
7. 批量查询标签，组装返回字段 `tags`。
8. 如果传入 `appId`，把 `openapi.appId === appId` 的记录排在前面。
9. 在 appId 置顶分组内，根据 `sortBy` 排序：创建时间、最后使用时间按倒序，剩余积分按升序。

### copy/delete/health/auth

不改运行时行为：

- `copy` 继续返回真实明文 Key，不返回标签相关特殊信息。
- `delete` 删除 Key，不删除标签。
- `health` 不返回标签，但返回 `usagePoints` 和 `maxUsagePoints`，便于调用方判断已用额度和积分上限；`maxUsagePoints=-1` 表示无限制。
- `authOpenApiKey` 不读取、不返回标签和 `appName`。

## 默认标签策略

暂不内置系统标签，也不做懒初始化。

- 新成员标签列表初始为空。
- 用户按需创建业务标签。
- 历史数据里如果已经存在 `type='system'` 标签，继续返回并允许编辑、删除和绑定，按普通标签处理。

## 前端展示与交互

### 组件策略

UI 参考知识库标签管理的交互模式，但 API Key 单独做一套组件，不直接复用知识库标签组件。

原因：

1. 知识库标签组件绑定了 dataset、collection、context 和集合批量操作语义。
2. API Key 标签只需要管理标签本身和 Key 绑定关系，业务边界更窄。
3. 单独实现可以复用视觉和交互模式，避免引入知识库上下文依赖。

建议新增组件：

```text
projects/app/src/components/support/apikey/TagManageModal.tsx
projects/app/src/components/support/apikey/TagMultiSelect.tsx
projects/app/src/components/support/apikey/TagDisplayList.tsx
```

参考来源：

- 标签管理弹窗参考 `projects/app/src/pageComponents/dataset/detail/CollectionCard/TagManageModal.tsx` 的结构，包括搜索、新增、编辑、删除和使用数量展示。
- 表格内标签展示参考 `projects/app/src/pageComponents/dataset/detail/CollectionCard/TagsPopOver.tsx` 的 `+N` 和 Popover 展示全部标签方式。

API Key 专用标签管理弹窗设计：

1. 标题：`标签管理`。
2. 顶部展示标签总数、搜索框、新增标签按钮。
3. 列表展示标签名、绑定 Key 数量、编辑按钮、删除按钮。
4. 所有标签都允许编辑和删除；历史 `type='system'` 标签按普通标签处理。
5. 删除标签前使用 `PopoverConfirm` 二次确认。
6. 删除标签只解绑 Key，不删除 Key。
7. 搜索只在标签管理弹窗内过滤标签名，不影响 API Key list。

### 顶部工具栏

当前顶部已有标题、API Base URL 和新建按钮。改造后在这一区域下方、表格上方新增一行工具栏：

```text
搜索 Key 名称 | 标签筛选 | 排序 | 管理标签
```

布局规则：

1. `搜索 Key 名称` 放左侧，对应 list 的 `keyword`。
2. `标签筛选` 放搜索框右侧，对应 list 的 `tags`。
3. `排序` 放标签筛选右侧，对应 list 的 `sortBy`。
4. `管理标签` 放排序右侧，打开标签管理弹窗。
5. 不增加无标签筛选。
6. 右上角原有 `新建` 按钮保留。
7. 账号 API Key 页完整展示四项工具；应用发布页空间更紧，可以把 `管理标签` 收进标签筛选下拉底部，但搜索、标签筛选和排序仍保留。

排序控件：

1. 默认值：`按创建时间`。
2. 可选：`按最后使用时间`、`按剩余积分`。
3. 从应用发布页进入时，仍然传 `appId` 给 list；`appId` 匹配的历史 Key 永远排在最前，排序控件只影响置顶组内和非置顶组内顺序。

标签筛选控件使用多选下拉：

1. 下拉列表展示所有真实标签，不展示 `appName` 特殊标签。
2. 选中后控件内显示 `已选 N 个标签`，不要把所有选中标签横向铺开。
3. 支持清空筛选。
4. 底部可以放 `管理标签` 入口，方便用户补标签。

### 列表展示

表格在名称下方展示标签，不再单独开标签列：

```text
名称 | API Key | 积分消耗 | 过期时间 | 最后使用时间 | 创建时间 | 操作
```

展示规则：

1. 名称列第一行展示 Key 名称，第二行展示标签。
2. 如果 `item.appName` 存在，前端构造一个展示用特殊标签，排在标签列表第一位。
4. `appName` 特殊标签不参与编辑、不参与删除、不写入 tag CRUD。
5. 其余标签来自 `item.tags`。
6. 最多展示 3 个标签。
7. `appName` 存在时固定占第一个展示位，真实标签最多再展示 2 个。
8. 超出的标签用 `+N` 收起。
9. hover 或点击 `+N` 用 Popover 展示全部标签。
10. 如果没有 `appName` 且没有用户标签，标签列显示 `-` 或留空，按现有表格空值风格决定。
11. `appName` 标签使用特殊样式，表示旧应用来源。参考图里的蓝色应用名标签：不可编辑、不可删除、不进入普通标签管理，也不能手动添加给其他 Key。
12. 真实标签使用普通浅色背景。
13. 标签高度控制在约 20px，小字号，标签列最多一行，避免表格行过高。
14. 最后使用时间和创建时间分两列展示；空间不足时允许在日期和时间之间自然换行。
15. 名称和标签展示超长时单行截断，使用 `MyTooltip` 在 hover 时展示完整内容。

名称列辅助说明：

- 普通新 Key 可展示轻量命名提示，例如 `推荐命名：场景 + 环境`。
- 历史带 `appId` 的 Key 可展示 `历史 Key 自动归类`。
- 辅助说明只作为解释文本，不承担标签筛选或标签管理语义。

表格上方不增加特殊标签说明提示，避免干扰主流程。

建议前端计算：

```ts
const displayTags = [
  ...(item.appName
    ? [{ _id: `appName-${item._id}`, name: item.appName, type: 'appName', readonly: true }]
    : []),
  ...item.tags
];

const visibleTags = displayTags.slice(0, 3);
const hiddenTags = displayTags.slice(3);
```

`TagDisplayList` 建议 props：

```ts
type ApiKeyDisplayTag = {
  _id: string;
  name: string;
  type: 'appName' | 'system' | 'custom';
  readonly?: boolean;
};

type TagDisplayListProps = {
  tags: ApiKeyDisplayTag[];
  maxVisible?: number; // 默认 3
};
```

示例：

```text
名称：客户 A Key
标签：[客服助手] [客户 A] [正式调用] [+4]
```

```text
名称：测试 Key
标签：[测试环境] [临时调试] [客户 B] [+2]
```

### 创建和编辑

`EditKeyModal` 增加标签选择：

- 打开弹窗前或页面初始化时调用 `getOpenApiTags`。
- 创建 Key 时提交 `tags: selectedTagIds`。
- 编辑 Key 时用 `defaultData.tags.map((tag) => tag._id)` 初始化选中项。
- 保存时提交 `tags: selectedTagIds`。
- API Key 名称输入框最大长度 50。

`appName` 特殊标签不展示在编辑控件中。

### 筛选与搜索

API Key 管理页增加：

- 名称搜索输入框，对应 `keyword`。
- 标签筛选控件，对应 `tags`。
- 标签名称输入框最大长度 50。

应用发布页或应用详情页进入 API Key 表格时，调用 list 传当前 `appId`，让历史同应用 Key 排在前面：

```ts
getOpenApiKeys({ appId, sortBy })
```

## 前端 API 封装

文件：`projects/app/src/web/support/openapi/api.ts`

新增：

```ts
export const getOpenApiTags = (params?: GetOpenApiTagListQueryType) =>
  GET<GetOpenApiTagListResponseType>('/support/openapi/tag/list', params);

export const createOpenApiTag = (data: CreateOpenApiTagBodyType) =>
  POST<CreateOpenApiTagResponseType>('/support/openapi/tag/create', data);

export const updateOpenApiTag = (data: UpdateOpenApiTagBodyType) =>
  PUT<UpdateOpenApiTagResponseType>('/support/openapi/tag/update', data);

export const deleteOpenApiTag = (tagId: DeleteOpenApiTagQueryType['tagId']) =>
  DELETE<DeleteOpenApiTagResponseType>('/support/openapi/tag/delete', { tagId });
```

现有 `createAOpenApiKey` 和 `putOpenApiKey` 类型随 OpenAPI schema 自动接受 `tags`。

## 权限与安全

1. 标签管理只允许登录态，不允许 API Key 鉴权。
2. 标签必须属于当前 `{ teamId, tmbId }`。
3. Key 只能绑定当前 `{ teamId, tmbId }` 下的标签。
4. 标签不参与开放接口鉴权，不改变现有 API Key 使用能力。
5. `appName` 不参与开放接口鉴权，只在 API Key 管理列表返回。
6. 标签不会在外部开放接口、健康检查或用量记录中暴露。
7. 删除标签只解绑 Key，不删除 Key。

## 错误处理

建议新增 OpenAPI 错误码：

- `tagUnExist`：标签不存在或不属于当前成员。
- `tagNameDuplicate`：标签名重复。
- `systemTagReadonly`：系统标签不允许删除或重命名。

如果不新增错误码，可复用：

- 不存在或无权限：`OpenApiErrEnum.unAuth`
- 重名：业务字符串错误或新增更明确错误码
- 入参冲突：通过 zod refine + `parseApiInput` 返回请求参数错误

## 测试计划

新增测试：

```text
projects/app/test/api/support/openapi/tag/list.test.ts
projects/app/test/api/support/openapi/tag/create.test.ts
projects/app/test/api/support/openapi/tag/update.test.ts
projects/app/test/api/support/openapi/tag/delete.test.ts
```

扩展测试：

```text
projects/app/test/api/support/openapi/list.test.ts
projects/app/test/api/support/openapi/create.test.ts
projects/app/test/api/support/openapi/update.test.ts
projects/app/test/api/support/openapi/copy.test.ts
projects/app/test/api/support/openapi/health.test.ts
projects/app/test/pages/components/support/apikey/Table.test.tsx
```

覆盖点：

1. 首次标签 list 不创建默认标签，新成员标签列表为空。
2. API Key list 不创建默认标签。
3. 创建自定义标签成功。
4. 同一成员下标签重名失败。
5. 不同成员可创建同名标签。
6. 创建 Key 可通过 `tags` 绑定本人标签。
7. 更新 Key 可通过 `tags` 整体替换标签。
8. 创建或更新 Key 绑定其他成员标签失败。
9. 更新 Key 的 `tags: []` 会清空标签。
10. API Key list 返回 `appName`、`tagIds` 和 `tags`。
11. API Key list 只返回已落库的 `appName` 快照，不实时查询应用名。
12. API Key list 不回填历史 Key 的 `appName`，缺失数据由 `initv4151` 脚本处理。
13. API Key list 传 `appId` 时，相同 `appId` 的 Key 排在前面，但不筛掉其他 Key。
14. API Key list 支持 `keyword` 搜索名称。
15. API Key list 支持单标签筛选。
16. API Key list 支持多标签 `$all` 筛选。
17. 删除自定义标签会从本人 Key 中解绑，不影响其他成员。
18. 删除 API Key 不删除标签。
19. copy/health/authOpenApiKey 行为不受标签和 `appName` 影响；health 会返回 `usagePoints` 与 `maxUsagePoints`。
20. 前端名称下方会把 `appName` 构造成第一个特殊标签。
21. 前端名称下方最多展示 3 个标签，超出显示 `+N`，并可查看全部标签。
22. 标签筛选控件选中多个标签后显示 `已选 N 个标签`。
23. 表格在名称列下方展示标签，不单独开标签列。
24. 标签管理弹窗参考知识库标签管理交互，但不依赖知识库 context。
25. 不内置系统默认标签；历史 `type='system'` 标签在标签管理弹窗中可编辑、可删除。
26. `appName` 特殊标签不出现在标签筛选和标签管理列表中。
27. OpenAPI 文档包含 API Key `list/create/update` 新增字段和标签 CRUD 接口。
28. API Key list 支持 `sortBy=createTime|lastUsedTime|remainingPoints`。
29. API Key list 同时传 `appId` 和 `sortBy` 时，`appId` 置顶优先级高于排序字段。
30. 前端工具栏包含排序选框，默认按创建时间排序。

局部测试命令：

```bash
pnpm test projects/app/test/api/support/openapi/tag/list.test.ts
pnpm test projects/app/test/api/support/openapi/tag/create.test.ts
pnpm test projects/app/test/api/support/openapi/tag/update.test.ts
pnpm test projects/app/test/api/support/openapi/tag/delete.test.ts
pnpm test projects/app/test/api/support/openapi/list.test.ts
pnpm test projects/app/test/api/support/openapi/create.test.ts
pnpm test projects/app/test/api/support/openapi/update.test.ts
```

最后运行：

```bash
pnpm test
```

## 分阶段 TODO

### P0

- [x] 新增 `openapi_tags` schema、entity、service。
- [x] `openapi` schema 增加 `tagIds`、`appName`。
- [x] 新增 `initv4151.ts` 管理员脚本，全量回填历史 Key 的 `appName`。
- [x] 新增标签 CRUD OpenAPI schema、API 声明和路由注册。
- [x] 更新 API Key `list/create/update` OpenAPI schema，补齐 `tags`、`tagIds`、`appName`、`keyword`、`appId`、`sortBy` 字段。
- [x] 实现标签 list/create/update/delete API。
- [x] create/update Key 支持 `tags` 校验并写入 `tagIds`。
- [x] list Key 支持名称搜索、标签筛选，并返回 `tags`。
- [x] list Key 支持 `appId` 排序置前。
- [x] list Key 支持创建时间、最后使用时间、剩余积分排序，且 `appId` 置顶最高优先级。
- [x] list Key 对历史 `appId` Key 补齐并返回 `appName`。
- [x] 新增 API Key 专用 `TagManageModal`、`TagMultiSelect`、`TagDisplayList`，参考知识库标签管理交互但不复用其业务组件。
- [x] 前端在名称下方展示标签，`appName` 作为第一个特殊标签。
- [x] 前端去掉蓝色应用名特殊标签说明条。
- [x] 补充接口测试。
- [ ] 补充前端展示测试。

### P1

- [x] 标签 list 支持 `keyCount`。
- [x] 补充 keyCount 测试。

### P2

- [ ] 批量给 Key 增删标签。
- [ ] 批量删除长期未使用 Key。
- [ ] 标签合并。

## 待确认问题

1. 标签是否保持当前方案的成员级隔离 `{ teamId, tmbId }`，还是要做团队共享标签？
2. 是否继续保留历史 `type='system'` 字段？当前保留兼容，历史 system 标签按普通标签处理。
3. 多标签筛选是否确定为 `$all` 语义？如果需要 OR，可以新增 `tagFilterMode`。
4. `appName` 字段是否需要在应用重命名后同步更新？本方案按历史展示快照处理，只在缺失时补齐。
