---
name: deprecate-workflow-node
description: 当用户需要弃用一个工作流节点（保留向后兼容、隐藏出模板面板）时触发该 skill。FastGPT 工作流节点的弃用流程标准化封装，覆盖模板、Dispatcher、UI 引用等所有需要改动的位置。
---

## When to Use This Skill

当用户需要"弃用 / 废弃 / 下线 / 不再推荐使用"某个工作流节点（例如 `LoopNode`、`RunAppModule` 等）时触发。

弃用的目标：
- 已存在的工作流仍能正常加载和运行（保持运行时兼容）。
- 新建工作流时，模板面板**不再展示**该节点。
- 节点的类型枚举值（FlowNodeTypeEnum）必须保留，否则旧工作流会找不到节点定义。

## 核心理念

弃用 ≠ 删除。**只断"新增入口"，不断"运行通路"**。

| 维度          | 处理方式                                       |
| ------------- | ---------------------------------------------- |
| 类型枚举值    | 保留（旧工作流引用）                           |
| 模板定义      | 移到 `abandoned/` 目录，从模板面板列表中移除 |
| Dispatcher    | 移到 `abandoned/` 目录，添加 `@deprecated` 注释 |
| moduleTemplatesFlat | 必须保留，否则节点无法在画布上渲染       |
| **节点级 UI 徽章** | 模板加 `status: PluginStatusEnum.SoonOffline`，节点头部出现黄色"即将下线"标签 + tooltip"请尽快替换" |
| 子节点 / 关联节点 | 仅当确认无其他节点共享时才一并弃用         |
| i18n key      | 不动（旧工作流仍会读取 name/intro 文案）       |

> ℹ️ 字段级 `deprecated: true`（`FlowNodeInputItemType.deprecated` / `FlowNodeOutputItemType.deprecated`）是**独立机制**，用于在保留节点的前提下淘汰单个字段（旧字段保留兼容、新字段替代）。**整节点弃用时不要用它** —— 节点级徽章已经足够指示，再加字段级会让信号过度冗余。

## 参考案例

仓库内已有一个完整的弃用案例可参考：`FlowNodeTypeEnum.runApp`。可通过对比 `git log --diff-filter=R -- "**/abandoned/runApp/**"` 找到当时的迁移 commit。

## TODO 模板（执行前先复制并填写）

> 操作目标：弃用 `<NodeTemplateName>`（FlowNodeTypeEnum.`<enumKey>`）

- [ ] 1. **确认影响面**
- [ ] 2. **移动模板定义**到 abandoned 目录
- [ ] 3. **移动 Dispatcher**到 abandoned 目录
- [ ] 4. **更新 `template/constants.ts`**：从 `systemNodes` 移除，确保留在 `moduleTemplatesFlat`
- [ ] 5. **更新 `dispatch/constants.ts`**：加 `@deprecated` 注释，移到 callbackMap 末尾
- [ ] 6. **节点级徽章**：模板加 `status: PluginStatusEnum.SoonOffline`（节点头部显示"即将下线"黄色标签）
- [ ] 7. **检查 UI / Hook 引用**（不一定需要改）
- [ ] 8. **运行 lint + typecheck + 局部测试**

---

## 详细步骤

### 1. 确认影响面（必做）

在动手之前，**先用 grep/Explore 全局搜索**节点的所有引用，确认改动范围。需要查的关键字：

```bash
# 类型枚举使用点
grep -rn "FlowNodeTypeEnum\.<enumKey>\b" packages/ projects/ --include="*.ts" --include="*.tsx"

# 模板对象（如 LoopNode）
grep -rn "<TemplateExport>\b" packages/ projects/ --include="*.ts"

# 子节点是否被其他容器复用（重要！）
grep -rn "FlowNodeTypeEnum\.<childEnum>" packages/ projects/
```

输出一份"需要改动 / 无需改动"分类清单。**通常无需改动**：
- `useWorkflow.tsx` 里嵌入到 PARENT_NODE_TYPES / unsupportedInLoop 这种"运行时识别"列表 —— 旧实例仍要工作。
- `Flow/index.tsx` 的 `nodeTypes` 映射 —— 旧实例需要 UI 渲染。
- i18n 文案 —— 旧实例仍读取。

### 2. 移动模板定义到 abandoned 目录

源路径：`packages/global/core/workflow/template/system/<dir>/`
目标路径：`packages/global/core/workflow/template/system/abandoned/<dir>/`

操作：
1. 用 `git mv`（或 Bash `mv`）整个目录或仅 parent 节点的 `index.ts`/`type.ts`。
2. 修改文件内的相对 import 路径（深度多了一层 `../`）。
3. 如果只弃用容器节点而保留子节点（例如 `loopStart`/`loopEnd` 仍被 `parallelRun` 共用），**只移动 parent 节点文件**，子节点留在原位置。

### 3. 移动 Dispatcher 到 abandoned 目录

源路径：`packages/service/core/workflow/dispatch/<dir>/<file>.ts`
目标路径：`packages/service/core/workflow/dispatch/abandoned/<file>.ts`

操作：
1. `git mv` 文件。
2. 文件首行加上 `/* Abandoned */` 注释（与 `dispatch/abandoned/runApp.ts` 一致）。
3. 修改文件内的相对 import 路径。

### 4. 更新 `packages/global/core/workflow/template/constants.ts`

```ts
// 旧
import { LoopNode } from './system/loop/loop';

// 新
import { LoopNode } from './system/abandoned/loop/index';
```

```ts
// 从 systemNodes 移除（这是模板面板的来源）
const systemNodes: FlowNodeTemplateType[] = [
  ...
  // LoopNode,  ← 删除这一行
  ...
];
```

```ts
// 在 moduleTemplatesFlat 中保留 / 添加（保证旧工作流能解析）
export const moduleTemplatesFlat: FlowNodeTemplateType[] = [
  ...,
  LoopNode,  // ← 这里要有
];
```

> ⚠️ 验证点：`moduleTemplatesFlat` 是节点 ID → 模板对象的查找源。**必须留**，否则旧工作流加载时会找不到节点，画布报错。

### 5. 更新 `packages/service/core/workflow/dispatch/constants.ts`

```ts
// 把 import 路径改成 abandoned 子目录
import { dispatchLoop } from './abandoned/runLoop';
```

把对应的 callbackMap 条目移到对象末尾，并加 `/** @deprecated */` 注释：

```ts
export const callbackMap: Record<FlowNodeTypeEnum, Function> = {
  // ...其他正常节点...

  /** @deprecated */
  [FlowNodeTypeEnum.loop]: dispatchLoop
};
```

### 6. 节点级徽章 `status: PluginStatusEnum.SoonOffline`

`FlowNodeTemplateTypeSchema.status` 是节点级的弃用 UI 信号，挂在 `NodeCard.tsx` 头部由 `<NodeStatusBadge />` 渲染：

| 值 | 标签 | 颜色 | tooltip | 适用场景 |
| --- | --- | --- | --- | --- |
| `Normal = 1` | 正常 | 蓝 | — | 不弃用 |
| `SoonOffline = 2` | 即将下线 | 黄 | "请尽快替换" | **弃用但仍可运行**（推荐用这个） |
| `Offline = 3` | 已下线 | 红 | "已无法使用，将中断应用运行，请立即替换" | 强制下线（运行时报错） |

由于弃用的核心理念是"运行通路保留"，应当用 `SoonOffline`；只有当节点被改成"运行时直接抛错"时才用 `Offline`。

```ts
import { PluginStatusEnum } from '../../../../../plugin/type';

export const FooNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.foo,
  // ...
  status: PluginStatusEnum.SoonOffline,   // ← 加这个
  // ...
};
```

> ⚠️ 注意：这字段挂在 `FlowNodeTemplateTypeSchema`（即 `system` 模板的扩展）上，不在 `FlowNodeCommonTypeSchema` 上。意思是只对**系统节点模板**生效，store 里保存的 nodeData 不带 status，每次打开通过 `moduleTemplatesFlat.find(...)` 从模板查到。所以**只需改模板，不需要数据迁移**。

> ⚠️ schema 上还有一个看似相关的 `abandon: z.boolean().optional()`（`FlowNodeCommonTypeSchema:72`）—— **不要用它**，整个仓库没有任何 UI/runtime 代码读取它，是死字段。

### 7. 检查 UI / Hook 引用

通常以下文件**保持原样**（运行时兼容需要）：
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/index.tsx` — `nodeTypes` 中的 React 渲染映射。
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useWorkflow.tsx` — `PARENT_NODE_TYPES`、`unSupportedInLoop` 等运行时校验。

如果该节点在前端有"添加按钮"快捷入口（不通过模板面板触发），那种入口可以删除。

### 8. 运行 lint + typecheck + 局部测试

```bash
# typescript 检查
pnpm lint

# 跑相关单测（按改动文件局部跑）
cd packages/service && pnpm test ...
```

不要全量跑测试，只跑改动相关的。

## 验证清单

弃用完成后，确认以下场景：

- [ ] 模板面板（"添加节点"侧边栏）里**搜不到**该节点。
- [ ] 已有该节点的旧工作流可以**打开、加载、运行**，UI 正常渲染。
- [ ] 旧工作流中该节点头部右侧出现黄色 **"即将下线"** 徽章，hover 显示替换提示。
- [ ] `pnpm lint` 通过。
- [ ] dispatch/constants.ts 里 callbackMap 仍是 `Record<FlowNodeTypeEnum, Function>` 完整覆盖（不能删 key，否则 TS 报错）。

## 反模式（不要做）

- ❌ 删除 `FlowNodeTypeEnum.<enumKey>` —— 旧工作流的 JSON 仍写着这个值。
- ❌ 从 `moduleTemplatesFlat` 移除 —— 旧工作流加载时找不到模板。
- ❌ 从 `dispatch/constants.ts` 的 callbackMap 删条目 —— 运行时报"unknown node type"。
- ❌ 删除 i18n 的 name / intro key —— 旧工作流的 tooltip / 节点标题会变成 raw key。
- ❌ 删除 React 节点组件（`Flow/index.tsx` 的 nodeTypes 映射）—— 画布渲染崩。
- ❌ 一并弃用共享子节点（如 `nestedStart`/`nestedEnd` 同时被多个容器使用）。
- ❌ 整节点弃用时**给 inputs/outputs 加字段级 `deprecated: true`** —— 节点级徽章已足够，字段级是独立机制（用于"留住节点、淘汰单个字段"的场景）。
