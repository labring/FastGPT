# 列表资源批量管理设计文档 (Agent / Tool / Skill / Dataset)

本文档定义 FastGPT 工作台各资源列表（Agent、Tool、Skill、Dataset）的「批量管理」需求交互规范、通用架构设计与技术落地方案。

---

## 1. 业务需求与核心交互

### 1.1 批量管理模式切换
* **入口排布**：
  * **Agent / Tool / Skill**：顶部操作栏次级按钮（`variant="grayBase"`，`px={'14px'}`，图标 `common/checkSquareBroken`）。
  * **Dataset**：遵循 [Figma 节点 2295-5308](https://www.figma.com/design/P2TQ41dGpKbUdKMrJXYBye/%E5%B7%A5%E4%BD%9C%E5%8F%B0%E5%88%97%E8%A1%A8%E9%A1%B5-%E7%AE%80%E6%98%93%E5%BA%94%E7%94%A8?node-id=2295-5308&m=dev) 规范，采用 `variant={'primaryOutline'}`（白色背景、主色边框与阴影，激活态为浅蓝背景 `primary.50` 与深色边框文字 `primary.600`），与「+ 新建」同层排布。
* **状态联动**：
  * 激活批量模式后，卡片列表隐藏新建卡片（`ListCreateCard`），避免在多选态下误触。
  * 切换父目录、检索关键词或筛选条件时，自动清空已选项并复位状态。

### 1.2 卡片多选与权限控制
* **操作权限要求**：
  * 仅具备管理权限或为 Owner（`hasManagePer || isOwner`）的项目允许勾选。
  * 仅读或无权用户：Checkbox 呈置灰禁用态（`not-allowed`），悬浮弹出 Tooltip「无当前资源的操作权限，无法批量操作」，点击卡片不触发选中。
* **热区与视觉表现**：
  * 可选卡片支持**整卡点击选中/取消**。
  * 悬浮态（Hover）禁用右下角 `···` 更多操作菜单，避免交互冲突。
  * 选中态卡片呈现主色边框高亮与浅蓝底色。

### 1.3 底部悬浮操作栏 (`CommonBatchActionBar`)
* **定位**：固定于视口底部水平居中，距离底边固定 **`16px`**，浮层层级 `zIndex=100`。
* **全选控制**：支持三态 Checkbox（未选 / 部分选中半选 `-` / 全部选中勾选），全选范围精确匹配当前筛选条件下有操作权限的项目。
* **已选计数**：高亮展示已选项目总数。
* **操作按钮**：未勾选任何项时「批量移动」与「批量删除」按钮自动禁用。

### 1.4 批量移动
* 复用通用的 `MoveModal`。
* 批量传入所选资源的 ID 列表（`moveResourceIds`），目录选择树中自动禁用所选文件夹，防止将文件夹移动到自身或已选子文件夹中形成环。
* 确认移动后，将所选对象的目标 `parentId` 批量更新为目标目录，并继承新目录权限。

### 1.5 批量删除二次确认 (`CommonBatchDeleteModal`)
* **统一规格与样式**：
  * 弹窗统一采用 `size="sm"`、`isCentered`、`overflow="hidden"`。
  * 底部统一由 `MyModal` 的 `footer` 渲染标准「取消」与「确认」按钮。
* **Owner 权限后置校验**：
  * 过滤出真正具有 Owner 删除权限的项目。若存在被过滤项目，弹窗顶部常驻展示提示条「已过滤无删除权限的...」。
* **动态描述文案**：
  * 纯资源、纯文件夹、资源与文件夹混选时，按数量动态展示警告说明。
* **待删除清单统一图标**：
  * **文件夹**：统一展示文件夹线性图标（`core/app/line/folderClosed`）。
  * **所有资源**（含应用、工作流、技能、知识库等）：统一展示正方体线性图标（`core/app/line/cube`）。
* **二次安全输入验证**：
  * 若有效删除项数为 1 个：输入该对象名称确认。
  * 若有效删除项数为 2 个及以上：统一输入「确认删除」确认。

---

## 2. 架构设计与代码收敛

### 2.1 通用组件抽象 (`components/common/batch/`)

```
projects/app/src/components/common/batch/
├── BatchActionBar.tsx      # 通用底部悬浮操作栏 (纯 UI + 交互回调)
└── BatchDeleteModal.tsx    # 通用批量删除确认弹窗 (权限过滤 + 文案生成 + 统一图标 + 安全输入)
```

1. **`CommonBatchActionBar`**：
   - 统一管理三态勾选、计数渲染、底距 16px 与移动/删除按钮状态。
   - Agent、Tool、Skill、Dataset 均无缝复用，保证全站底栏交互一致。
2. **`CommonBatchDeleteModal`**：
   - 接收泛型列表与业务类型 `type: 'app' | 'skill' | 'dataset'`。
   - 统一封装 Owner 权限过滤、多语言数量说明、`core/app/line/cube` 正方体图标渲染、`DeleteConfirmInput` 校验以及 `useRequest` 状态流。
   - 业务层只需保留数据转换与删除接口调用的轻量适配器（~40 行）。

### 2.2 各业务模块落地

| 模块 | 上下文 / 页面 | 顶部切换按钮 | 批量移动 | 批量删除适配器 |
| :--- | :--- | :--- | :--- | :--- |
| **Agent** | `AppListContext` | `grayBase` | `MoveModal` | `dashboard/agent/BatchDeleteModal.tsx` |
| **Tool** | `AppListContext`（复用 Agent 逻辑） | `grayBase` | `MoveModal` | `dashboard/agent/BatchDeleteModal.tsx` |
| **Skill** | `SkillListContext` | `grayBase` | `MoveModal` | `dashboard/skill/BatchDeleteModal.tsx` |
| **Dataset** | `DatasetsContext` | `primaryOutline` (Figma 规范) | `MoveModal` | `dataset/list/BatchDeleteModal.tsx` |

---

## 3. 验证规范

1. **单元测试**：
   - 业务逻辑覆盖在 `projects/app/test/pageComponents/dashboard/agent/batchManagement.test.ts`。
   - 重点验证：管理权限与 Owner 过滤、单选与多选确认词生成、分类计数与混选判定、批量移动防环逻辑。
2. **类型检查**：
   - 保持 `pnpm --filter app typecheck` 0 错误。

---

## 4. 批量 API 契约

批量接口的公共请求/响应 schema 位于 `packages/global/openapi/common/batch/api.ts`，资源模块只负责路由、权限校验和具体业务实现，不把 App、Dataset、Skill 的清理逻辑放进公共层。

### 4.1 路由命名

| 资源 | 批量移动 | 批量删除 |
| :--- | :--- | :--- |
| App / Tool | `POST /core/app/batch/move` | `POST /core/app/batch/delete` |
| Dataset | `POST /core/dataset/batch/move` | `POST /core/dataset/batch/delete` |
| Skill | `POST /core/ai/skill/batch/move` | `POST /core/ai/skill/batch/delete` |

### 4.2 请求结构

```json
{
  "ids": ["68ad85a7463006c963799a05"],
  "parentId": "68ad85a7463006c963799a06"
}
```

`ids` 必填、去重；删除请求不包含 `parentId`；移动到根目录时 `parentId` 传 `null`。

### 4.3 响应结构

```json
{
  "successIds": ["68ad85a7463006c963799a05"],
  "failedIds": [],
  "affectedIds": ["68ad85a7463006c963799a05"]
}
```

`successIds` 和 `failedIds` 表示请求资源的处理结果；`affectedIds` 表示实际发生变化的资源，删除操作允许包含被删除子资源的 ID，便于前端清理本地缓存。具体的权限、子树解析、事务和异步清理仍由资源模块实现。

### 4.4 核心服务下沉、并发队列与单项/批量复用

为理顺模块依赖方向、避免重复定义与逻辑漂移，各资源模块将单项能力下沉为独立的 Service 模块，API 接入层统一借助轻量并发执行队列调用它们：
* **App / Tool**: 
  - 单项删除由 `@/service/core/app/delete` 提供 `deleteApp`，单项路由 `pages/api/core/app/del.ts` 与批量路由 `batch/delete.ts` 均从该模块导入。
  - 单项移动由 `@/service/core/app/move` 提供 `moveApp`，批量路由 `batch/move.ts` 从该模块导入。
* **Dataset**: 
  - 单项删除由 `@/service/core/dataset/delete` 提供 `deleteDataset`，单项路由 `pages/api/core/dataset/delete.ts` 与批量路由 `batch/delete.ts` 均从该模块导入。
  - 单项移动由 `@/service/core/dataset/move` 提供 `moveDataset`，批量路由 `batch/move.ts` 从该模块导入。
* **Skill**: 
  - 单项删除由 `@/service/core/ai/skill/delete` 提供 `deleteSkill`，单项路由 `pages/api/core/ai/skill/delete.ts` 与批量路由 `batch/delete.ts` 均从该模块导入。
  - 单项移动由 `@/service/core/ai/skill/move` 提供 `moveSkill`，批量路由 `batch/move.ts` 从该模块导入。
* **并发队列控制**:
  - 服务端统一使用项目全局工具 `@fastgpt/global/common/system/utils` 中的 `batchRunSettled` 调度单项服务，并发度统一采用契约常量 `BATCH_RESOURCE_ACTION_CONCURRENCY = 10`。
  - 相比纯串行处理，吞吐量提升近 10 倍；相比全量无控并发（`Promise.all`），严格规避瞬间打满 MongoDB 事务连接池或触发并发写冲突。
* **前端状态与三态反馈联动**:
  - `CommonBatchDeleteModal` 与 `MoveModal` 精确区分“全部成功”（`success`）、“部分失败”（`warning`）与“全部失败”（`error`）三态 Toast。
  - 批量删除与移动完成后，各资源 Context 将 `selectedIds` 更新为 `failedIds`，只保留未成功的资源继续高亮，成功项随列表刷新自动移出，全部成功时自动退出批量模式。


