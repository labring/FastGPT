# 任务：App 与 Dataset 列表的 folder-only ancestorIds

## 任务 1：纯函数实现祖先路径计算

**说明：**增加与具体资源无关的纯函数，用于生成 folder 的 `ancestorIds`、确定它在当前目录中应显示的子项，以及重写被移动 folder 的后代路径。这里不放数据库和权限代码。

**验收标准：**
- [x] 根 folder 生成 `[]`；子 folder 生成 `[...parent.ancestorIds, parentId]`，且不包含自身。
- [x] 直接子 folder 返回自身；更深的 folder 返回当前目录之下的下一个祖先；不在当前目录下时返回 `null`。
- [x] 重写被移动 folder 时只替换旧前缀并保留后代后缀，包括移动到根目录。

**验证：**
- [x] `ancestorIds.test.ts`、`tree.test.ts` 与 `visibleChildren.test.ts` 均通过。
- [x] 纯函数无需单独构建。
- [x] 单元测试覆盖 `B=[A]`、`C=[A,B]`，以及父级为 `C` 的叶子在 `A` 下的展示路径。

**依赖：**无

**预计涉及文件：**
- `packages/global/common/parentFolder/ancestorIds.ts`
- `packages/global/common/parentFolder/tree.ts`
- `packages/global/common/parentFolder/visibleChildren.ts`
- `packages/global/test/common/parentFolder/ancestorIds.test.ts`
- `packages/global/test/common/parentFolder/tree.test.ts`
- `packages/global/test/common/parentFolder/visibleChildren.test.ts`

**规模：**小，1–2 个文件

## 任务 2：补充 App 与 Dataset 的 Schema、类型和索引

**说明：**给 App 和 Dataset 的存储类型及 Mongoose Schema 增加可选的 `ancestorIds`。只有 folder 文档会写入该字段。再增加一个按团队范围查询子树的多键索引。

**验收标准：**
- [x] 两个 Schema 都把 `ancestorIds` 声明为可选的 ObjectId 数组，且不给非 folder 设置默认空数组。
- [x] 两个 Schema 都通过 `defineIndex` 注册 `{ teamId: 1, ancestorIds: 1 }`，并使用要求该字段存在的 partial filter。
- [x] 存储用的 Zod 类型接受该字段；列表和详情响应不返回该字段。

**验证：**
- [x] `schemaIndexes.test.ts`、App OpenAPI 与 Dataset OpenAPI 测试均通过。
- [x] `pnpm --filter @fastgpt/app typecheck` 通过。
- [x] 索引测试确认新索引键和 partial filter 已注册，字段没有隐式索引默认值。

**依赖：**无

**预计涉及文件：**
- `packages/service/core/app/schema.ts`
- `packages/service/core/dataset/schema.ts`
- `packages/global/core/app/type.ts`
- `packages/global/core/dataset/type.ts`
- `packages/service/test/common/mongo/schemaIndexes.test.ts`

**规模：**中，3–5 个文件

## 任务 3：在 App folder 创建和移动时维护路径

**说明：**创建 App 的 `folder` 或 `toolFolder` 时写入 `ancestorIds`；`moveApp` 改变 folder 父级时，重算该 folder 及其后代 folder 的路径。叶子资源仍只保留 `parentId`。现有权限更新与路径更新必须使用同一个 session，包括非继承分支的提前返回。

**验收标准：**
- [x] 创建两种 App folder 都保存父路径；创建任何非 folder 都不写入 `ancestorIds`。
- [x] 把 folder 移到根目录或另一个 folder 时，自身和每个后代 folder 的路径都只更新一次，且后代的 `parentId` 不变。
- [x] 移动非 folder 只改变它的 `parentId`；Agent folder 不能获得工具 folder 作为祖先。

**验证：**
- [x] App folder 创建和移动路径测试通过，App list API 测试通过。
- [x] `pnpm --filter @fastgpt/app typecheck` 通过。
- [x] 测试覆盖继承与非继承分支、嵌套 folder 重建、非 folder 无 `ancestorIds`、后代 `parentId` 不变及工具树隔离。

**依赖：**任务 1、任务 2

**预计涉及文件：**
- `projects/app/src/pages/api/core/app/folder/create.ts`
- `projects/app/src/service/core/app/move.ts`
- `packages/service/common/parentFolder/ancestorIds.ts`
- `packages/global/openapi/core/app/folder/api.ts`
- `packages/global/openapi/core/app/folder/index.ts`
- `projects/app/src/web/core/app/api/app.ts`
- `projects/app/test/api/core/app/folderAncestorIds.test.ts`
- `projects/app/test/api/core/app/move.test.ts`

**规模：**中，3–5 个文件

## 任务 4：在 Dataset folder 创建和移动时维护路径

**说明：**对 Dataset folder 使用相同的写入契约。`moveDataset` 的继承与非继承两个分支都要更新路径，并通过 `parentId` 链路查找后代。

**验收标准：**
- [x] 创建 Dataset folder 时保存 `ancestorIds`；创建知识库资源时不保存。
- [x] 移动 Dataset folder 时只重算 folder 后代，并保留现有的权限、Collection 同步和深度校验。
- [x] 移动非 folder 的 Dataset 资源时不写入 `ancestorIds`。

**验证：**
- [x] Dataset folder 创建和嵌套移动路径测试通过。
- [x] `pnpm --filter @fastgpt/app typecheck` 通过。
- [x] Dataset 更新测试及现有 ACL / Collection 移动测试保持通过，并覆盖继承与非继承 folder 移动。

**依赖：**任务 1、任务 2

**预计涉及文件：**
- `projects/app/src/pages/api/core/dataset/folder/create.ts`
- `projects/app/src/service/core/dataset/move.ts`
- `packages/service/common/parentFolder/ancestorIds.ts`
- `projects/app/src/web/core/dataset/api.ts`
- `projects/app/test/api/core/dataset/folderAncestorIds.test.ts`
- `projects/app/test/api/core/dataset/update.test.ts`

**规模：**中，3–5 个文件

## 任务 5：提供 folder 路径数据清洗迁移脚本

**说明：**新增并注册一个数据清洗迁移脚本。它以 `parentId` 为唯一权威来源，为历史 App folder、工具 folder 和 Dataset folder 生成或纠正 `ancestorIds`，并清除非 folder 上的该字段。实现时遵循 `.agents/skills/system/system-migration-development/SKILL.md`，只追加到注册表末尾，不修改已发布的迁移。

**验收标准：**
- [x] 脚本位于 `projects/app/src/migration/tasks/4173/20261022_backfill_folder_ancestor_ids/`，任务 ID 为 `20261022_backfill_folder_ancestor_ids`，使用 `blockStartup: false` 和分批断点续跑；失败策略为 `continue`。
- [x] 清洗覆盖未删除和已软删除的目标 folder。根节点写入空路径，子节点写入父路径加父 ID；非 folder 上已有的 `ancestorIds` 被清除。脚本不修改 `parentId`、权限和业务字段。
- [x] App folder 与工具 folder 分树清洗。父文档缺失、父类型不匹配、成环或超深的 folder 不写入，并以集合名、文档 ID 和原因记入失败明细。
- [x] 重复执行幂等；从 checkpoint 恢复时不重扫已完成批次，并先重试已保存的坏数据。验证阶段检查两个集合的完整快照。

**验证：**
- [x] 注册表、迁移编排与迁移数据服务测试通过。
- [x] `pnpm --filter @fastgpt/app typecheck` 通过。
- [x] 注册顺序、i18n key 与 `apps`、`datasets`、`validation` 三个进度阶段符合系统迁移规范。

**依赖：**任务 2

**预计涉及文件：**
- `projects/app/src/migration/registry.ts`
- `projects/app/src/migration/tasks/4173/20261022_backfill_folder_ancestor_ids/index.ts`
- `projects/app/src/migration/tasks/4173/20261022_backfill_folder_ancestor_ids/service.ts`
- `projects/app/test/migration/registry.test.ts`
- `projects/app/test/migration/tasks/4173/20261022_backfill_folder_ancestor_ids/`
- `packages/web/i18n/{zh-CN,en,ko-KR,zh-Hant}/system_migration.json`

**规模：**中，3–5 个文件

## 检查点：任务 1–5 完成后

- [x] 路径函数、两条写入链路、Schema 索引和迁移测试通过
- [x] 确认路径格式为 folder-only 的有序祖先 ID 数组，根目录为空数组，叶子资源不写此字段
- [x] 列表与权限行为已按确认后的契约继续实现

## 任务 6：纯函数合并当前目录的可见项

**说明：**实现内存合并，把可读资源和 folder 路径记录转换为当前目录去重后的条目、访问模式、排序、分页结果和总数。

**验收标准：**
- [x] 按约定合并可读的直接子资源、可读的空 folder，以及通往更深可读资源的第一个 folder。
- [x] 不返回无关同级项和不可访问的空 folder；拥有真实读权限的 folder 不会被标记为仅导航。
- [x] `total` 和分页在合并及稳定排序之后计算，而不是分别取自两份输入列表。

**验证：**
- [x] `visibleChildren.test.ts` 覆盖可读、导航、隐藏、类型过滤和 read 优先级。
- [x] 纯函数无需单独构建。
- [x] 测试覆盖 `B` 仅导航、`D` 可读、不可访问空目录隐藏。

**依赖：**任务 1

**预计涉及文件：**
- `packages/global/common/parentFolder/visibleChildren.ts`
- `packages/global/test/common/parentFolder/visibleChildren.test.ts`

**规模：**小，1–2 个文件

## 任务 7：App V2 列表、搜索范围与浏览校验

**说明：**非所有者的 App V2 目录列表使用合并结果；所有者列表仍由 MongoDB 分页。所有者和非所有者的搜索都限定在当前 folder 子树内。允许列出仅导航 folder，但不授予读权限。只给 folder 列表项增加可选的 `folderAccessMode`。

**验收标准：**
- [x] 非所有者的分页和 `total` 包含仅导航 folder，并排除不可访问的同级项；所有者仍按直接子项分页。
- [x] 指定父目录的搜索范围为当前 folder 及其后代 folder，仍执行 ACL 过滤，且不添加仅导航行。根目录搜索仍使用团队范围。
- [x] 没有 folder 读权限的用户，只有在该 folder 通往可读资源时才能列出它。App 详情仍拒绝该用户。

**验证：**
- [x] App V2 列表测试通过，包含跨页 `total`、read/navigate、空目录隐藏和子树搜索。
- [x] `pnpm --filter @fastgpt/app typecheck` 通过。
- [x] API 响应测试覆盖 folder `read` / `navigate` 标记和非 folder 不带标记。

**依赖：**任务 3、任务 6

**预计涉及文件：**
- `projects/app/src/pages/api/core/app/listV2.ts`
- `projects/app/src/service/core/app/visibleList.ts`
- `packages/global/core/app/type.ts`
- `packages/global/openapi/core/app/common/api.ts`
- `projects/app/test/api/core/app/list.test.ts`

**规模：**中，3–5 个文件

## 检查点：任务 6–7 完成后

- [x] App V2 的列表、搜索、分页和仅导航浏览测试通过
- [x] App 响应采用可选 `folderAccessMode`，Dataset 随后复用同一枚举契约

## 任务 8：Dataset V2 列表、搜索范围与浏览校验

**说明：**把 App V2 的契约应用到 Dataset V2。子树 folder 先使用 `ancestorIds` 查询，并通过 `parentId` 遍历补齐历史路径缺失的数据，同时保留可读资源的 ACL 过滤。

**验收标准：**
- [x] Dataset 的非所有者列表、所有者快速路径、合并后的 `total` 和仅导航浏览校验与任务 7 一致。
- [x] Dataset 搜索仍限制在当前子树内，不返回不可访问的命中，也不返回合成的仅导航行。
- [x] Dataset 详情仍要求真实读权限，详情响应不包含路径元数据。

**验证：**
- [x] Dataset V2 列表测试通过，覆盖分页、导航、空目录隐藏与子树搜索。
- [x] `pnpm --filter @fastgpt/app typecheck` 通过。
- [x] App 与 Dataset 使用相同的 read/navigate 标记值。

**依赖：**任务 4、任务 6、任务 7

**预计涉及文件：**
- `projects/app/src/pages/api/core/dataset/listV2.ts`
- `projects/app/src/service/core/dataset/visibleList.ts`
- `packages/global/core/dataset/type.ts`
- `projects/app/test/api/core/dataset/list.test.ts`

**规模：**中，3–5 个文件

## 检查点：任务 8 完成后

- [x] Dataset V2 API 测试通过
- [x] App 与 Dataset 使用相同的 `read` / `navigate` 响应标记
- [x] 修改界面前确认 API 行为并调整根目录创建权限回退逻辑

## 任务 9：面包屑授权

**说明：**让 App 与 Dataset 面包屑接口使用与列表相同的浏览授权。响应仍只包含 folder ID 和名称。

**验收标准：**
- [x] 仅导航的源 folder 能返回当前路径；没有可读后代的 folder 仍返回现有权限错误。
- [x] 响应 Schema 仍只包含现有的路径项字段。
- [x] 真实读取权限仍可用；App/Dataset 路径 helper 对 `current` 和 `parent` 语义保持兼容。

**验证：**
- [x] App 与 Dataset 路径 API 测试通过，覆盖导航路径、不可访问空目录拒绝和只返回 ID/名称。
- [x] `pnpm --filter @fastgpt/app typecheck` 通过。
- [x] 路径响应仍通过原有 Zod response schema 校验。

**依赖：**任务 7、任务 8

**预计涉及文件：**
- `projects/app/src/pages/api/core/app/folder/path.ts`
- `projects/app/src/pages/api/core/dataset/paths.ts`
- `projects/app/test/api/core/app/folderPath.test.ts`
- `projects/app/test/api/core/dataset/paths.test.ts`
- `packages/service/common/parentFolder/ancestorIds.ts`

**规模：**中，3–5 个文件

## 任务 10：App 与 Dataset 列表页容忍仅导航 folder

**说明：**让工作台的 App/工具列表和 Dataset 列表能打开仅导航 folder。folder 详情仍可能因现有读权限校验失败；该失败不得阻塞列表和面包屑。管理操作继续由真实权限对象控制。

**验收标准：**
- [ ] 需浏览器验收：打开仅导航 folder 时，能显示面包屑和 V2 子项，且详情请求失败不会遮挡列表。
- [x] 除非真实权限允许，否则编辑、移动、删除、权限和创建操作保持隐藏或禁用；根目录创建权限不会错误继承到仅导航 folder。
- [x] 可读 folder 和资源保留现有操作与跳转行为。

**验证：**
- [x] App 与 Dataset V2 列表、路径 API 测试通过。
- [x] `pnpm --filter @fastgpt/app typecheck` 通过。
- [ ] 人工浏览器检查尚未执行：从可读的深层资源经过不可读父目录逐层进入，并确认详情仍拒绝、没有管理操作。

**依赖：**任务 7、任务 8、任务 9

**预计涉及文件：**
- `projects/app/src/pageComponents/dashboard/agent/List.tsx`
- `projects/app/src/pageComponents/dataset/list/List.tsx`

**规模：**小，2 个文件

## 任务 11：Agent Skill 目录导航和子树搜索

**说明：**Skill 列表沿用现有 `parentId` 树，不新增 `ancestorIds` 字段或迁移。用户只拥有后代 Skill 读取权限时，可以从上层目录逐级导航；搜索限定在当前目录及后代目录，并且只返回 ACL 可读的 Skill。

**验收标准：**
- [x] 非所有者列表合并真实可读资源与通往可读后代的首层 folder，并在 folder 上返回 `read` / `navigate`。
- [x] 面包屑和列表允许进入仅导航目录，Skill 详情仍使用原有 ACL；仅导航卡片不显示说明、创建者、权限或时间信息。
- [x] 有目录时的搜索限定当前目录子树，不返回同名的其他分支资源；搜索结果不合成导航 folder。
- [x] Skill 页面在仅导航目录隐藏创建、导入等操作入口及创建卡片。

**验证：**
- [x] `projects/app/test/api/core/ai/skill/list.test.ts` 通过，覆盖可导航 folder、面包屑和跨分支同名搜索。
- [x] `pnpm --filter @fastgpt/app typecheck` 通过。
- [ ] 浏览器手工验收尚未执行。

**依赖：**任务 9、任务 10

**预计涉及文件：**
- `packages/service/core/ai/skill/manage/{folder,list}.ts`
- `projects/app/src/pages/api/core/ai/skill/{listV2.ts,folder/path.ts}`
- `projects/app/src/pageComponents/dashboard/skill/{context.tsx,List.tsx}`
- `projects/app/src/pages/dashboard/skill/index.tsx`
- `packages/global/openapi/core/ai/skill/api.ts`
- `projects/app/test/api/core/ai/skill/list.test.ts`

**规模：**中

## 任务 12：兼容 Workflow Core/CLI 测试 workspace

**说明：**当前 CI 的 `test-workflow-core` 和 `test-workflow-cli` 会传入新的 `FASTGPT_TEST_SCOPE`；测试 checkout 仍可能是尚未包含这些 workspace 的 PR 分支。已知 scope 在 workspace 尚不存在时应当安全跳过，而不能被解析器拒绝或传给 Turborepo 导致失败。

**验收标准：**
- [x] `workflow-core` 和 `workflow-cli` 是合法测试 scope；workspace 存在时转成对应 Turborepo filter，不存在时不执行不存在的 package。
- [x] GitHub 与 Forgejo workflow 文件保持未改动；这是测试 runner 的兼容处理。

**验证：**
- [x] `test/testRunner.test.ts` 覆盖新 scope。
- [x] `FASTGPT_TEST_SCOPE=workflow-core pnpm test` 和 `FASTGPT_TEST_SCOPE=workflow-cli pnpm test` 均通过。
- [x] 原 CI 上 `report-coverage` 的失败来自 `Check Test Results` 汇总两个 test scope 失败；覆盖率评论权限错误只是 warning。

**规模：**小

## 检查点：完成

- [x] 任务 1–9 已实现并通过对应局部测试；任务 10 的权限回退和类型检查已完成
- [x] App、Dataset 与 Skill 的 V2 列表、搜索、browse 授权与面包屑已实现
- [x] 仅导航能力不会授予详情读取权限；App 和 Dataset 详情拒绝场景已有 API 覆盖
- [x] Collection 和 V1 列表接口未修改
- [x] 实现前的范围与行为契约已确认
- [ ] 浏览器手工验收尚未执行：逐层打开仅导航目录并检查菜单、创建操作及详情拒绝
