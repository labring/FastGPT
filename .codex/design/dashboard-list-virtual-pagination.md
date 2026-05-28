# Dashboard 列表本地虚拟分页技术方案

## 背景

Dashboard 中 Agent、Tool、Skill 以及知识库列表在资源数量较多时，会一次性渲染全部卡片。卡片内容包含头像、权限状态、更新时间、菜单、Tooltip/Popover 等交互组件，首屏渲染和后续 React reconciliation 成本会随资源数量线性增长。

本方案目标是在不改变后端接口、不改变现有列表排序和权限逻辑的前提下，为这些卡片网格增加本地分批渲染能力：首屏只渲染若干行资源，用户滚动到底部后再追加下一批行数。

## 范围

### 需要覆盖的列表

- Agent / Tool 列表：`projects/app/src/pageComponents/dashboard/agent/List.tsx`
- Skill 列表：`projects/app/src/pageComponents/dashboard/skill/List.tsx`
- Dataset 列表：`projects/app/src/pageComponents/dataset/list/List.tsx`

### 页面入口引用关系

- `projects/app/src/pages/dashboard/agent/index.tsx`
  - 引用 `@/pageComponents/dashboard/agent/List`
  - 用于 Agent 列表。
- `projects/app/src/pages/dashboard/tool/index.tsx`
  - 同样引用 `@/pageComponents/dashboard/agent/List`
  - 通过 `AppListContext` 的类型参数和路由上下文区分 Tool 列表。
- `projects/app/src/pages/dashboard/skill/index.tsx`
  - 引用 `@/pageComponents/dashboard/skill/List`
  - 向列表传入 `onClickCreate` 和 `guardSkillSandboxOperation`。
- `projects/app/src/pages/dataset/list/index.tsx`
  - 引用 `@/pageComponents/dataset/list/List`
  - 列表数据来自 `DatasetsContext`。

## 设计原则

1. 保持列表数据来源不变：仍使用各自 Context 中已经拉取好的完整列表。
2. 只减少 DOM 渲染数量，不改变服务端分页、排序、权限过滤和搜索逻辑。
3. 虚拟分页以“行”为单位追加，而不是以固定 item 数追加，以适配不同断点下的列数变化。
4. 搜索词、父级目录、资源类型等列表维度变化时，从初始批次重新渲染。
5. 保持现有卡片组件、菜单、权限弹窗、移动弹窗、删除确认等交互逻辑不变。

## 主要逻辑

### 1. 批次行数

每个列表定义相同的基础参数：

```ts
const virtualPageRows = 5;
const virtualPreloadPageCount = 3;
const virtualBatchRows = virtualPageRows * virtualPreloadPageCount;
const defaultGridColumnCount = 1;
```

含义：

- `virtualPageRows`：一次滚动追加的基础行数。
- `virtualPreloadPageCount`：首屏预加载页数，避免用户刚进入页面就频繁触发加载。
- `virtualBatchRows`：首屏和每次追加的行数，当前为 15 行。
- `defaultGridColumnCount`：Grid 尚未挂载或无法计算列数时的兜底列数。

### 2. 列表维度 key

为每个列表生成 `virtualPaginationKey`，用于判断当前虚拟分页状态是否仍属于同一个列表视图。

Agent / Tool 列表建议包含：

```ts
const virtualPaginationKey = `${router.pathname}-${appType}-${parentId || ''}-${searchKey}`;
```

Skill 列表建议包含：

```ts
const virtualPaginationKey = `${router.pathname}-${router.query.parentId || ''}-${searchKey}`;
```

Dataset 列表建议包含：

```ts
const virtualPaginationKey = `${router.pathname}-${parentId || ''}-${searchKey}`;
```

当目录、搜索词、资源类型或路由维度变化时，如果 `virtualRowsState.key` 与当前 key 不一致，则本轮可见行数回退到 `virtualBatchRows`，避免新列表沿用旧列表已经加载过的行数。

### 3. 计算 Grid 列数

列表容器使用 Chakra `Grid`，列数由响应式 `gridTemplateColumns` 决定。运行时通过 Grid DOM 的 computed style 计算实际列数。

实现步骤：

1. 给 Grid 绑定 `gridRef`。
2. 在 `useEffect` 中读取 `getComputedStyle(grid).gridTemplateColumns`。
3. 如果值存在且不是 `none`，按空格切分得到列数。
4. 如果无法读取，则使用 `defaultGridColumnCount`。
5. 使用 `ResizeObserver` 监听 Grid 尺寸变化。
6. 同时监听 `window.resize`，覆盖浏览器断点变化和布局容器变化。
7. 只有列数真的变化时才更新 state，减少不必要重渲染。

示意逻辑：

```ts
const updateGridColumnCount = useCallback(() => {
  const grid = gridRef.current;
  if (!grid) return;

  const gridTemplateColumns = getComputedStyle(grid).gridTemplateColumns;
  const columnCount =
    gridTemplateColumns && gridTemplateColumns !== 'none'
      ? gridTemplateColumns.split(' ').filter(Boolean).length
      : defaultGridColumnCount;

  setGridColumnCount((prev) => (prev === columnCount ? prev : columnCount));
}, []);
```

### 4. 计算当前可见资源数量

统一先计算当前应渲染的最大格子数：

```ts
const maxGridItemCount = loadedRows * gridColumnCount;
```

不同列表对创建卡片占位的处理不同。

Agent / Tool 列表：

- Grid 内始终存在一个创建相关卡片。
- 有创建权限时渲染 `ListCreateButton`。
- 无创建权限时渲染 `ForbiddenCreateButton`。
- 因此资源卡片数量需要固定扣掉 1 个格子。

```ts
const visibleAppCount = Math.max(maxGridItemCount - 1, 0);
const visibleApps = myApps.slice(0, visibleAppCount);
```

Skill 列表：

- 目标上应与 Agent 列表保持一致，也预留一个创建卡片占位。
- 即使当前阶段创建卡片渲染条件仍与 Agent 不完全一致，虚拟分页计算也按最终一致形态预留 1 个格子。

```ts
const visibleSkillCount = Math.max(maxGridItemCount - 1, 0);
const visibleSkills = skills.slice(0, visibleSkillCount);
```

Dataset 列表：

- 当前 Grid 中没有内嵌创建卡片，创建入口在页面头部按钮中。
- 因此不需要扣减占位。

```ts
const visibleDatasetCount = loadedRows * gridColumnCount;
const visibleDatasets = formatDatasets.slice(0, visibleDatasetCount);
```

### 5. 渲染策略

现有列表从完整数组直接 `map` 改为可见数组 `map`：

- `myApps.map(...)` 改为 `visibleApps.map(...)`
- `skills.map(...)` 改为 `visibleSkills.map(...)`
- `formatDatasets.map(...)` 改为 `visibleDatasets.map(...)`

卡片内部结构保持不变，包括：

- Tooltip / Popover
- Avatar / Icon
- 权限标识
- 操作菜单
- 删除确认
- 移动弹窗
- 权限设置弹窗
- 点击进入详情或文件夹
- 拖拽到文件夹能力

这种做法只改变列表子节点数量，不改变单个卡片的行为边界。

### 6. 加载更多触发

在 Grid 下方渲染一个 1px 高度的哨兵节点：

```tsx
{hasMoreVirtualItems && <Box ref={virtualLoadMoreRef} h={'1px'} />}
```

当可见数量小于总数量时，创建 `IntersectionObserver` 监听该节点。节点进入视口后追加 `virtualBatchRows` 行。

为避免 observer 在同一次交叉回调中重复追加，使用 ref 标记本轮是否正在追加：

```ts
const isAppendingVirtualRowsRef = useRef(false);
```

追加后，当 `visibleItems.length` 变化，再将该 ref 重置为 `false`。

示意逻辑：

```ts
useEffect(() => {
  if (!hasMoreVirtualItems) return;

  const target = virtualLoadMoreRef.current;
  if (!target) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting && !isAppendingVirtualRowsRef.current) {
        isAppendingVirtualRowsRef.current = true;
        setVirtualRowsState((state) => ({
          key: virtualPaginationKey,
          rows:
            (state.key === virtualPaginationKey ? state.rows : virtualBatchRows) +
            virtualBatchRows
        }));
      }
    },
    { threshold: 0.1 }
  );

  observer.observe(target);

  return () => observer.disconnect();
}, [hasMoreVirtualItems, virtualPaginationKey, visibleItems.length]);
```

### 7. 空状态和加载态

保持现有空状态逻辑不变：

- 数据为空且正在请求时返回 loading 或 null。
- 搜索无结果时继续展示原有 EmptyTip。
- 真正无资源时继续展示原有创建入口或空提示。

虚拟分页只在列表数据长度大于 0 且 Grid 渲染时生效。

## 可能修改的目录和文件

### 直接修改文件

```txt
projects/app/src/pageComponents/dashboard/agent/List.tsx
projects/app/src/pageComponents/dashboard/skill/List.tsx
projects/app/src/pageComponents/dataset/list/List.tsx
```

### 关联但原则上不需要修改的页面入口

```txt
projects/app/src/pages/dashboard/agent/index.tsx
projects/app/src/pages/dashboard/tool/index.tsx
projects/app/src/pages/dashboard/skill/index.tsx
projects/app/src/pages/dataset/list/index.tsx
```

这些页面负责提供滚动容器、搜索框、创建按钮、Context Provider 和列表组件引用。虚拟分页应封装在列表组件内部，不要求页面入口改造。

### 关联组件

```txt
projects/app/src/pageComponents/dashboard/ListCreateCard.tsx
projects/app/src/pageComponents/dashboard/agent/context.tsx
projects/app/src/pageComponents/dashboard/skill/context.tsx
projects/app/src/pageComponents/dataset/list/context.tsx
```

说明：

- `ListCreateCard` 是 Agent/Tool/Skill 网格内创建卡片的基础组件。
- 三个 Context 继续提供完整列表、搜索词、父级目录、刷新函数等数据。
- 虚拟分页不应向 Context 下沉，避免把纯 UI 渲染策略扩散到数据层。

### 可选抽象

如果后续还会有更多卡片网格接入相同能力，可以考虑抽出 hook：

```txt
projects/app/src/hooks/useVirtualGridList.ts
```

建议初期先在三个列表内局部实现，原因是三处列表对创建卡片占位、空状态、Grid 断点、滚动容器和卡片结构存在差异。等逻辑稳定后再抽象，可以降低一次性改造范围。

## 风险与边界

1. `getComputedStyle(...).gridTemplateColumns` 的字符串格式依赖浏览器实际计算结果，需要保证切分后能正确得到列数。
2. `ResizeObserver` 在浏览器环境可用；仍需保留 `typeof ResizeObserver === 'undefined'` 的兜底。
3. Skill 列表需要与后续“创建占位卡片始终存在”的 UI 逻辑保持一致，否则虚拟分页计算会先按最终形态预留一格。
4. 本方案不是传统窗口虚拟列表，不会卸载已经滚出视口的卡片；它只做增量分批渲染，因此滚动到很深后 DOM 数量仍会增加。
5. 拖拽移动只能作用于当前已渲染的卡片和文件夹。未渲染的文件夹不会作为可拖拽目标出现，这与本地分批渲染的行为一致。

## 测试策略

### 类型与静态检查

```bash
pnpm exec tsc --noEmit --pretty false --project projects/app/tsconfig.json
pnpm exec eslint projects/app/src/pageComponents/dashboard/agent/List.tsx projects/app/src/pageComponents/dashboard/skill/List.tsx projects/app/src/pageComponents/dataset/list/List.tsx
```

### 手动验证

1. 准备超过首批渲染数量的 Agent、Tool、Skill、Dataset 数据。
2. 分别在桌面端和移动端进入列表页。
3. 确认首屏只展示初始批次资源。
4. 向下滚动到底部，确认能追加下一批资源。
5. 修改搜索词，确认列表从初始批次重新开始。
6. 进入文件夹和返回父级目录，确认批次状态不会串用。
7. 调整浏览器宽度，确认列数变化后每批渲染数量随 Grid 列数更新。
8. 验证卡片点击、更多菜单、删除、复制、移动、权限设置、导出等原有交互不受影响。

## TODO

- [ ] 在 Agent / Tool 列表中接入按行分批渲染。
- [ ] 在 Skill 列表中接入按行分批渲染，并按目标形态预留创建卡片占位。
- [ ] 在 Dataset 列表中接入按行分批渲染，不预留创建卡片占位。
- [ ] 为三个列表增加 Grid 列数计算、ResizeObserver 监听和窗口 resize 兜底。
- [ ] 为三个列表增加底部 IntersectionObserver 哨兵节点。
- [ ] 验证搜索、目录切换、资源类型切换时虚拟分页状态重置。
- [ ] 运行 TypeScript 与 ESLint 局部检查。
- [ ] 完成桌面端和移动端手动验证。
