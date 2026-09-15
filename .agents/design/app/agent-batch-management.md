# 工作台 Agent 列表批量管理设计文档

本文档定义 FastGPT 工作台（Agent 列表页）的「批量管理」需求分析、架构设计与实施计划。

---

## 1. 需求分析

### 1.1 业务背景
当前工作台 Agent 列表仅支持单个卡片的移动、重命名、权限配置及删除，缺乏批量操作能力。在应用数量较多或需要整理目录时，操作繁琐且效率较低。
根据 Figma 设计稿（`工作台列表页-简易应用`），需为工作台 Agent 列表增加批量管理功能，支持卡片多选、批量移动和批量删除，并严格联动权限校验与状态显示。

### 1.2 核心交互设计

#### 1. 进入与退出批量管理模式
* **入口**：列表顶部右侧操作区，在「+ 文件夹」左侧新增「批量管理」按钮。
* **状态切换**：
  * 未激活状态：普通次级按钮样式（`variant="grayBase"`），带有批量复选框图标及「批量管理」文本。
  * 激活状态：处于批量管理模式时呈激活态（浅蓝背景 `primary.50`，蓝色边框/文字/图标 `primary.600`）。
  * 再次点击或按快捷键/特定动作可退出批量管理模式，并清空所有已选项。
* **列表内容联动**：
  * 进入批量模式后，**隐藏网格中的新建卡片**（`ListCreateCard`），避免在多选态下误触新建。
  * 保持顶部的筛选栏（类型、创建者、排序）及搜索栏可用。

#### 2. 卡片多选交互（多选卡片）
* **多选框呈现**：
  * 批量模式下，所有卡片（普通应用卡片与文件夹卡片）右上角绝对定位显示 Checkbox。
* **权限受限状态（无管理/Owner权限）**：
  * 对于当前用户无批量操作权限（`!hasManagePer && !isOwner`，仅读或仅写权限均无权批量操作）的应用：
    * Checkbox 处于置灰禁用状态（对齐设计稿：空选框背景 `#F9F9F9`、边框 `1px solid #CECECE`、无内部禁用图标，鼠标光标为 `not-allowed`）。
    * 鼠标悬浮在该 Checkbox 时，弹出 Tooltip 提示：**「无当前应用的操作权限，无法批量操作」**。
    * 点击该卡片任何区域均**不可选中**。
* **选中与悬浮行为**：
  * 对于有权限的可选卡片，**点击卡片任意区域**均视为选中/取消选中（整卡为热区）。
  * 点击不会触发进入文件夹或打开应用详情。
  * 悬浮态（Hover）体验：右下角的时间戳**不再切换为 `···` 更多操作菜单**，保持静态时间展示，避免交互冲突。
  * 选中态视觉：卡片高亮蓝色边框，Checkbox 勾选。

#### 3. 底部悬浮操作栏（Floating Action Bar）
* 批量模式开启后，在页面底部居中悬浮展示操作条：
  * **全选筛选项**：
    * 带有三态复选框（未选 / 部分选中半选 `-` / 全部选中勾选）。
    * 复选框后显示文本：**「全选筛选项」**。
    * 全选范围遵循当前上方的筛选条件（搜索关键词、类型筛选、创建者筛选），且只选中当前列表中**有操作权限**的项。
  * **已选计数**：
    * 展示 **「已选 <span color="primary.600">{count}</span> 项」**。
  * **操作按钮组**：
    * **「批量移动」**：未勾选任何项时禁用；点击后弹出移动弹窗。
    * **「批量删除」**：未勾选任何项时禁用；点击后弹出删除二次确认弹窗。

#### 4. 批量移动逻辑
* 沿用现有的移动文件夹/应用逻辑（`MoveModal`）。
* 弹出「移动应用」Modal，提示文案：**「移动后，所选应用/文件夹将继承新文件夹的权限设置。」**。
* 目录选择树中，自动将正在移动的文件夹（及包含的项）标记为禁用（`disabledIds`），防止将文件夹移动到自身或选中的其他子文件夹中形成环。
* 确认移动后，将所有已选对象的目标 `parentId` 更新为选定文件夹，完成后刷新列表并清空选择/退出批量模式，给出操作成功提示。

#### 5. 批量删除二次确认（多选删除组件）
* **触发机制与区分**：
  * 单个对象直接删除（从卡片 `···` 菜单触发）：沿用原有输入对象名称的确认方式。
  * 批量删除（在批量操作栏触发）：
    * 若选中的有效删除项数为 1 个：输入该应用/文件夹名称确认。
    * 若选中的有效删除项数为 2 个及以上：统一输入 **「确认删除」** 文本进行确认。
* **权限后置校验与过滤提示**：
  * 如果选中的项目中包含仅具备管理/编辑权限但非 Owner（无删除权限）的项，弹窗顶部显示提示条：
    * 提示文案：**「已过滤无删除权限的应用」**。
    * 弹窗仅对真正有删除权限的应用/文件夹进行统计与删除，避免越权报错。
* **动态描述文案**：
  * 仅应用：`确认删除以下应用吗？删除以下应用会将其关联的对话记录一并删除。`（或带数量 `确认删除 {n} 个应用...`）
  * 仅文件夹：`确认删除以下文件夹吗？删除后，这些文件夹及其包含的全部应用、关联对话记录将被一并删除。`
  * 混选：`确认删除 {appCount} 个应用和 {folderCount} 个文件夹。删除以下应用会将其关联的对话记录一并删除。`
* **将删除清单**：
  * 展示「将删除」灰底容器，列出所有待删除项的图标与名称（应用与文件夹图标区分），超出高度滚动显示。
* **输入确认框与按钮**：
  * 提示文案：`请输入 确认删除 以确认`（或 `请输入 {name} 以确认`）。
  * 确认按钮初始为禁用，仅当输入文本与目标确认词一致时激活。

---

## 2. 架构设计与技术方案

### 2.1 状态管理扩展 (`AppListContext`)
在 `projects/app/src/pageComponents/dashboard/agent/context.tsx` 中增加批量管理相关上下文：
* `isBatchMode: boolean`：当前是否处于批量管理模式。
* `setIsBatchMode: (val: boolean | ((prev: boolean) => boolean)) => void`：切换批量模式。
* `selectedAppIds: string[]`：当前已选中的应用/文件夹 ID 列表。
* `setSelectedAppIds: React.Dispatch<React.SetStateAction<string[]>>`：设置已选项。
* `onToggleSelectApp: (id: string) => void`：切换单个项目的选中状态。
* `onSelectAllApps: (checked: boolean) => void`：全选/取消全选当前有权限的筛选项。
* `selectableApps: AppListItemType[]`：根据当前权限（`hasManagePer || isOwner`）计算的可操作列表。
* `hasSelectedAll: boolean` 与 `isIndeterminate: boolean`：全选 Checkbox 的三态计算属性。

### 2.2 UI 组件拆分与实现
1. **顶部操作按钮**：
   * 在 `projects/app/src/pages/dashboard/agent/index.tsx` 工具栏中添加「批量管理」Toggle 按钮。
2. **卡片层改造** (`projects/app/src/pageComponents/dashboard/agent/List.tsx`)：
   * 增加 `isBatchMode` 控制：
     * 批量模式下不渲染 `ListCreateCard`。
      * 卡片右上角渲染 Checkbox：
        * 若当前 item 既无管理权也无 Owner 权（`!hasManagePer && !isOwner`），渲染置灰空选框，并套上 `MyTooltip` 提示「无当前应用的操作权限，无法批量操作」。
        * 若卡片可选，点击卡片直接调用 `onToggleSelectApp(app._id)`。
      * 禁用 Hover 时的 `···` 菜单展示。
3. **底部悬浮操作栏** (`BatchActionBar.tsx`)：
   * 独立组件，位于 `projects/app/src/pageComponents/dashboard/agent/BatchActionBar.tsx`。
   * 包含全选复选框、已选计数文本、批量移动按钮、批量删除按钮。
4. **批量删除弹窗** (`BatchDeleteModal.tsx`)：
   * 独立组件，位于 `projects/app/src/pageComponents/dashboard/agent/BatchDeleteModal.tsx`。
   * 接收待删除的所有应用列表，过滤出 `isOwner` 的项（若过滤了项，显示「已过滤无删除权限的应用」提示条）。
   * 根据应用与文件夹数量生成说明文案。
   * 渲染待删除清单（带图标）。
   * 复用 `DeleteConfirmInput` 进行输入确认（`确认删除` 或单个时的对象名称）。
   * 确认后调用批量删除或并发删除，更新状态并给出成功反馈。
5. **批量移动弹窗**：
   * 复用 `MoveModal`，支持传入多个已选 ID，并在 `SelectOneResource` 的 `disabledIds` 中包含所有选中的文件夹，确保不可将文件夹移动到自身或已选文件夹内。

### 2.3 国际化文案
在 `packages/web/i18n/zh-CN/app.json`、`en/app.json`、`zh-Hant/app.json`、`ko-KR/app.json` 中补充相应文案：
* `batch_manage`: 批量管理
* `batch_move`: 批量移动
* `batch_delete`: 批量删除
* `select_all_filtered`: 全选筛选项
* `selected_count`: 已选
* `unit_item`: 项
* `filtered_no_delete_permission_tip`: 已过滤无删除权限的应用
* `read_only_no_batch_permission`: 无当前应用的操作权限，无法批量操作
* `confirm_delete_apps_tip`: 确认删除以下应用吗？删除以下应用会将其关联的对话记录一并删除。
* `confirm_delete_folders_tip`: 确认删除以下文件夹吗？删除后，这些文件夹及其包含的全部应用、关联对话记录将被一并删除。
* `confirm_delete_mixed_tip`: 确认删除以下应用和文件夹吗？删除后，这些应用及其关联的对话记录，以及文件夹内的全部内容将被一并删除。
* `delete_apps_and_folders_confirm_title`: 确认删除 {{appCount}} 个应用和 {{folderCount}} 个文件夹
* `delete_apps_confirm_title`: 确认删除 {{count}} 个应用
* `delete_folders_confirm_title`: 确认删除 {{count}} 个文件夹
* `will_delete`: 将删除

---

## 3. TODO 列表

- [x] 1. 国际化文案补充（zh-CN, zh-Hant, en, ko-KR）
- [x] 2. `AppListContext` 扩展批量模式与选中状态逻辑
- [x] 3. 批量删除确认弹窗组件 `BatchDeleteModal.tsx` 实现
- [x] 4. 底部悬浮操作栏组件 `BatchActionBar.tsx` 实现
- [x] 5. 卡片列表 `List.tsx` 多选交互改造（Checkbox、禁用提示、隐藏新建、隐藏 `···` 悬浮）
- [x] 6. 顶部「批量管理」按钮及状态切换（`dashboard/agent/index.tsx`）
- [x] 7. 批量移动逻辑与 `MoveModal` 联动集成
- [x] 8. 局部自动化测试与类型检查验证
