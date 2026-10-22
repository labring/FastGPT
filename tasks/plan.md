# 实现计划：App 与 Dataset 列表的 folder-only ancestorIds

## 概述

为 App 和 Dataset 的目录列表增加只存在 folder 上的 `ancestorIds` 路径，使用户能逐层进入自己真正可读的资源，同时不把这条路径当成 ACL 的读权限。`ancestorIds` 只保存在 folder 文档上，顺序为从根 folder 到直接父 folder，不包含 folder 自身。非 folder 资源继续只使用现有的 `parentId`。路径存储与迁移覆盖 App 的 `folder`、`toolFolder` 和 Dataset 的 `folder`；Agent Skill 不新增路径字段，沿用 `parentId` 解析目录、导航权限和子树搜索。Collection 行为保持不变。

行为契约见飞书文档《[Folder-only ancestorIds：目录列表与搜索行为设计](https://fael3z0zfze.feishu.cn/docx/CUCCdVcOEoZrXfx0Yi2cvCAsnHc)》。

## 架构决策

- 路径元数据不是权限。资源是否可读仍由现有协作者 ACL 判定。folder 本身有真实读权限时，即使没有可读后代，也返回 `folderAccessMode: "read"`。没有读权限的 folder 只有在它是通往可读后代的下一层时，才以 `folderAccessMode: "navigate"` 返回。详情、编辑、删除和移动仍使用现有权限校验。
- 团队所有者可以看到所有直接子资源，不需要派生仅导航项。所有者的列表和搜索继续由 MongoDB 分页。非所有者的目录列表要先合并直接可读子资源与仅导航 folder，再排序、分页和计算 `total`。
- 搜索范围是当前 folder 及其后代 folder，不包括祖先和子树之外的同级资源。搜索结果仍只包含通过 ACL 的可读命中，不向搜索页插入仅导航 folder。App V2 搜索目前忽略 `parentId`，需要补上这个范围；Dataset V2 已有该范围，可以把 folder 查找改为使用 `ancestorIds`。Skill 没有 `ancestorIds`，从现有 `parentId` 树确定子树范围。
- folder 创建或移动时，`ancestorIds` 必须在同一个 Mongo session 中维护。移动叶子资源仍只改 `parentId`。后代 folder 使用现有的 `parentId` 链路遍历查找，不依赖当时的 `ancestorIds`，因此历史数据尚未回填完成时移动仍然正确。
- 列表读取优先使用 `ancestorIds`，再按 `parentId` 逐层补齐，直到没有新的子 folder。数据健康时一次查询即可完成。路径缺失或过期时，当次请求仍能解析结果，但读路径不回写修复。
- 历史数据清洗必须幂等，且不阻塞启动。脚本只以 `parentId` 为权威来源，重算 folder 的 `ancestorIds`，并清除非 folder 上的该字段；不修改 `parentId`、权限或业务内容。由于列表有 `parentId` 兜底，清洗失败不阻止服务进入业务就绪。脚本仍必须注册到系统迁移框架。
- V1 列表接口继续只返回直接子项。现有的层级浏览已经调用 V2。本计划不让 `getAllApps` 和 `getAllDatasets` 返回仅导航项。
- Agent folder 与工具 folder 共用 App 集合，但仍是两棵独立的树。路径遍历不得跨越 `folder` 和 `toolFolder`。`httpPlugin` 不作为本字段的 folder。

## 列表算法

对非所有者列出当前目录 `C`（`null` 表示根目录）时：

1. 用现有 ACL 调用得到可读资源 ID，并继续应用当前的团队、删除、创建者和搜索过滤。
2. 加载子树 folder：当前目录的直接子 folder、`ancestorIds` 包含 `C` 的 folder，再补上 `parentId` 指向已加载 folder 的 folder。遍历受现有深度和节点数上限保护。根目录加载该团队中对应类型的全部 folder。
3. 以薄投影加载可读资源，其 `parentId` 为 `C` 或上述子树 folder 之一。类型过滤作用于这些资源。
4. 对可读 folder，可见项是它到 `C` 的路径上位于 `C` 之下的第一个 folder；若它的父级就是 `C`，则可见项是它自身。对可读的非 folder，对其父 folder 使用同一规则。路径不经过 `C` 的资源忽略。
5. 把这些项目与 `parentId` 为 `C` 的可读资源取并集，按 ID 去重。真实读权限优先于仅导航。
6. 使用该列表现有排序；请求要求置顶时保留置顶排序，并以 `_id` 升序作为稳定的并列排序。`total` 为合并后的数量。只回填并补充当前页的完整列表项。
7. 只有当前类型过滤已经包含该 folder 类型时，才返回仅导航项。现有工作台和知识库浏览都会带上 folder 类型；显式排除 folder 的调用方不会收到合成出来的 folder。

进入 `C` 的条件是：folder 属于当前团队且未删除，并且用户拥有读权限，或者第 4 步会因某个可读资源选中 `C`。这个浏览校验独立于 `authApp` / `authDataset` 的读权限校验。folder 详情接口不改。

面包屑接口 `/core/app/folder/path` 和 `/core/dataset/paths` 只对源 folder 使用同一套浏览校验。它们可以返回现有的 `{ parentId, parentName }` 链，其中可以包含用户没有读权限的祖先 folder 名称，但不得返回简介、权限或其他详情字段。

## 任务列表

任务详情记录在 [tasks/todo.md](tasks/todo.md)。

### 阶段一：路径数据
- 任务 1：纯函数实现祖先路径计算
- 任务 2：补充 App 与 Dataset 的 Schema、类型和索引
- 任务 3：在 App folder 创建和移动时维护路径
- 任务 4：在 Dataset folder 创建和移动时维护路径
- 任务 5：提供 folder 路径数据清洗迁移脚本

### 检查点：路径数据
- 路径、Schema、移动和迁移的局部测试通过

### 阶段二：App 浏览
- 任务 6：纯函数合并当前目录的可见项
- 任务 7：App V2 列表、搜索范围与浏览校验

### 检查点：App 浏览
- App 列表 API 测试覆盖可读、仅导航、分页、搜索和详情拒绝

### 阶段三：Dataset 浏览
- 任务 8：Dataset V2 列表、搜索范围与浏览校验

### 检查点：Dataset 浏览
- Dataset 列表 API 测试覆盖同一契约

### 阶段四：浏览界面
- 任务 9：面包屑授权
- 任务 10：App 与 Dataset 列表页容忍仅导航 folder
- 任务 11：Agent Skill 目录导航和子树搜索

### 阶段五：CI 测试兼容
- 任务 12：兼容尚未包含 Workflow Core/CLI workspace 的测试分支

### 检查点：完成
- `tasks/todo.md` 中的 API 与界面检查通过
- Collection 和 V1 列表行为保持不变

## 数据清洗迁移脚本

上线前必须提供一个系统迁移脚本，把已有目录数据洗成 `ancestorIds` 约定。脚本不是手工临时命令，而是追加到 `projects/app/src/migration/registry.ts` 末尾的自动任务，目录为 `projects/app/src/migration/tasks/4173/20261022_backfill_folder_ancestor_ids/`，永久任务 ID 为 `20261022_backfill_folder_ancestor_ids`。任务使用非阻塞启动与 `continue` 失败策略。

清洗范围是 `apps` 中的 `folder`、`toolFolder`，以及 `datasets` 中的 `folder`，包括已软删除文档。非 folder 不生成路径；如果历史数据在非 folder 上存在 `ancestorIds`，脚本将该字段清除。

每个团队、每种 folder 类型单独建树。脚本只读取 `_id`、`parentId` 和现有 `ancestorIds`，忽略旧的 `ancestorIds`，从 `parentId` 为空的根节点重建路径。子 folder 的新路径为父路径加上父 ID。以下数据不写入，并记入可定位的失败记录：父文档不存在、父类型不属于同一棵树、出现环，或深度超过现有 folder 深度上限。只有计算结果与当前值不同时才更新，因此重复执行不会改变已清洗的数据。

写入按 `_id` 游标分批，每批在业务写入成功、错误快照持久化后保存 checkpoint。中断后从上一个完整批次继续，并先重试已记录的坏数据。进度分为 `apps`、`datasets` 和 `validation` 三个阶段。校验要求每个成功清洗的 folder 满足：根节点路径为空，其余节点的最后一个祖先等于 `parentId`，且路径不包含自身；所有非 folder 都不再保留该字段。

## 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 非所有者列表在分页前物化子树内的全部可读资源 | 中 | 所有者查询仍由 MongoDB 分页。非所有者只读取薄投影；folder 数量已有产品上限，可读 ID 查询也是现有开销。 |
| 滚动升级期间旧节点移动 folder，造成 `ancestorIds` 过期 | 中 | 移动时按 `parentId` 查找后代。索引路径不完整时，读取按 `parentId` 补齐。清洗脚本可以重复执行，并以最新的 `parentId` 覆盖过期路径。 |
| 仅导航 folder 的详情和面包屑目前会因读权限失败，页面无法打开 | 高 | 列表、浏览校验和面包屑改动一起交付。界面把详情 403 视为仅导航，而不是阻塞整页的错误。 |
| App 与 Dataset 的路径实现逐渐分叉 | 中 | 共享纯路径计算和合并函数。Mongo 查询与 ACL 调用仍留在两个现有列表处理器中。 |
| 类型过滤意外隐藏或泄露 folder | 中 | 只有请求的类型过滤包含对应 folder 类型时才添加仅导航项。分别测试带 folder 的筛选和显式排除 folder 的调用。 |

## 待确认问题

没有。范围、可读的空目录、合并后分页、子树搜索，以及 `read` / `navigate` 响应标记都已确认。除非之后明确改变界面决策，搜索页不增加仅导航行。
