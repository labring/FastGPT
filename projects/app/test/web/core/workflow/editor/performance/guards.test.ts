/**
 * 06a 的守门清单：把「不许把宽订阅写回来」固化成可执行断言。
 *
 * 合成 React render harness 已删除；此前的叶子允许集合只覆盖被登记的消费点，新代码完全可以在别处把宽订阅
 * 写回来而不触发静态规则。`AppContext` 整体订阅更是连叶子都挂不上（标准交互没有一条会改
 * `appDetail`，挂一个永远不会变的叶子只是假绿）。所以这两类都只能静态守。
 *
 * 断言依据是 06 总纲决策 5 / 13 / 14 与 06a-4..8 的收口结论；命中即失败，
 * 失败信息给出「相对 src 的路径:行号: 片段」，直接可定位。
 *
 * 纯源码扫描，不挂载组件，因此不受 harness fixture 规模限制。用整文件正则而不是逐行匹配，
 * 才能命中跨行书写的 `useContextSelector(\n  Ctx,\n  (v) => v\n)`。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../src');
const detailRoot = join(srcRoot, 'pageComponents/app/detail');
const flowRoot = join(detailRoot, 'WorkflowComponents/Flow');
/** 编辑器目录：画布组件树 + adapter / host / projection / codec。 */
const editorRoots = [flowRoot, join(srcRoot, 'web/core/workflow')];
/** 双 host 页面：选中写入的调用点可能落在 Flow 之外（`SearchButton` 就是一例）。 */
const selectionRoots = [...editorRoots, join(detailRoot, 'Workflow'), join(detailRoot, 'Plugin')];
/** 画布投影与本地数组的写入方：全量物化不许回流到这里。 */
const projectionRoots = [
  join(srcRoot, 'web/core/workflow/editor/canvas/projectWorkflowCanvas.ts'),
  join(flowRoot, 'context')
];

const walkSources = (target: string): string[] => {
  if (!statSync(target).isDirectory()) return /\.(tsx?|jsx?)$/.test(target) ? [target] : [];
  return readdirSync(target).flatMap((entry) => walkSources(join(target, entry)));
};

/** 扫描命中，产出 `相对 srcRoot 的路径:行号: 压平片段`。 */
const scan = (targets: string[], pattern: RegExp): string[] =>
  targets.flatMap((target) =>
    walkSources(target).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(new RegExp(pattern.source, 'gs'))].map((match) => {
        const line = text.slice(0, match.index ?? 0).split('\n').length;
        return `${relative(srcRoot, file)}:${line}: ${match[0].replace(/\s+/g, ' ')}`;
      });
    })
  );

/** `useContextSelector(Ctx, (v) => v)`：selector 恒等返回 context 值本身，即整体订阅。 */
const wholeContextSelector = (contextName = '[A-Za-z_$][\\w$]*') =>
  new RegExp(
    `useContextSelector\\(\\s*${contextName}\\s*,\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)\\s*=>\\s*\\1\\s*\\)`
  );

describe('workflow editor subscription guards', () => {
  it('编辑器目录内零 context 整体订阅（含 WorkflowModalContext）', () => {
    // 拆字段不减少组件函数执行次数，但保住子树不重渲染、也保住 useMemo 依赖不被无关字段顶掉。
    expect(scan(editorRoots, wholeContextSelector())).toEqual([]);
  });

  it('编辑器目录内零 AppContext 整体订阅', () => {
    // AppContext 的值随 appDetail / currentTab / appLatestVersion / loadingApp 变化：
    // 整体订阅意味着切 tab 就重渲染所有 HTTP 节点、Agent 节点与全部走 CommonInputForm 的字段。
    expect(scan(editorRoots, wholeContextSelector('AppContext'))).toEqual([]);
  });

  it('Handle 目录与 ButtonEdge 内零 adapter 结构订阅', () => {
    // 这两处是按节点数 / 边数线性增长的实例，结构句柄随结构变化重建，订阅它等于全画布刷新。
    // 连通判定走 useWorkflowValue + Runtime 图查询，写命令走 useWorkflowActions()。
    const targets = [
      join(flowRoot, 'nodes/render/Handle'),
      join(flowRoot, 'components/ButtonEdge.tsx')
    ];
    expect(
      scan(
        targets,
        /\buseWorkflow\s*\(|\buseWorkflowDocument\s*\(|useWorkflow as useWorkflowAdapter/
      )
    ).toEqual([]);
  });

  it('整个 Flow 目录零 adapter useWorkflow()', () => {
    // 上一条只守按实例数增长的 Handle 与 ButtonEdge；06a-5 的 B 类（只在事件回调里读 edges/nodes）
    // 散在 Flow 全目录，任何一处被写回无参 useWorkflow() 就是整体结构订阅，
    // 合成叶子白名单只覆盖已登记标签，管不到新代码。
    // 同目录的画布交互 hook 是带参调用（useWorkflow({ helperLinesRef })），不在扫描范围内。
    expect(
      scan([flowRoot], /\buseWorkflow\s*\(\s*\)|\buseWorkflow as useWorkflowAdapter\b/)
    ).toEqual([]);
  });

  it('零 useReactFlow().setNodes 与零 reset 变更来源', () => {
    // 受控模式下 setNodes(整份数组) 会被 @reactflow/core 转成 N 个 reset 变更，
    // 而 applyNodeChanges 一见 reset 就丢弃原数组整份重建（06 总纲决策 13）。
    // 选中写入只走 canvas context 的 onNodesChange 漏斗，且只对真的变了的节点发 select 变更。
    expect(scan(selectionRoots, /\{[^{}]*\bsetNodes\b[^{}]*\}\s*=\s*useReactFlow\(\)/)).toEqual([]);
    expect(scan(selectionRoots, /type:\s*['"]reset['"]/)).toEqual([]);
  });

  it('app 侧零 getWorkflowGraphReader', () => {
    // 图索引只在 Runtime 内（bySource / byTarget / childrenByParent），app 侧读取一律走
    // runtime.getGraphQueries()；自建 nodeMap / childrenNodeIdListMap 就是把它重做一遍。
    expect(scan([srcRoot], /\bgetWorkflowGraphReader\b|\bWorkflowGraphReader\b/)).toEqual([]);
  });

  it('画布投影路径零 storeNode2FlowNode 全量物化', () => {
    // storeNode2FlowNode 只允许出现在入站边界（editor/codec.ts 的 materializeWorkflow，
    // hydrate 与版本切换各一次）与单节点复制（NodeCard.onCopyNode）。
    // 投影与画布数组写入方一次都不许调它，否则每次重投影都是全量模板物化。
    expect(scan(projectionRoots, /\bstoreNode2FlowNode\b/)).toEqual([]);
  });

  it('画布与 Reference 不对普通字段事件做全量刷新', () => {
    const canvasSource = readFileSync(join(flowRoot, 'canvas/workflowCanvasContext.tsx'), 'utf8');
    const adapterSource = readFileSync(
      join(srcRoot, 'web/core/workflow/editor/react/workflowEditorAdapter.tsx'),
      'utf8'
    );

    expect(canvasSource).not.toMatch(/runtime\.subscribe\(syncFromRuntime\)/);
    expect(canvasSource).toMatch(/change\.affectedRecords\.structure/);
    expect(adapterSource).toMatch(/change\.changedRecords\.edgeIds\.length > 0/);
  });

  it('画布节点组件零 useWorkflowDocument()', () => {
    // 整份语义快照的身份按 semanticVersion 换，单字段提交也 bump：节点组件订阅它等于
    // 「任意一笔写入都重算并重渲染全部节点的派生列表」。节点作用域一律用
    // useNodeWorkflowDocument({ nodeId })，它只在变更命中本节点或来源闭包时换身份。
    // 定义文件自己的文档注释里写了调用形式，按文件名排掉。
    expect(
      scan([join(flowRoot, 'nodes')], /\buseWorkflowDocument\s*\(\s*\)/).filter(
        (hit) => !hit.includes('render/useWorkflowDocument.ts')
      )
    ).toEqual([]);
  });

  it('编辑器目录零渲染期 zoom 订阅', () => {
    // 滚轮缩放的每一帧都换 transform，渲染期订阅它会让侧边栏与节点表单逐帧重渲染。
    // 事件回调里要缩放读 useReactFlow().getZoom()（函数，不订阅）。
    expect(scan(editorRoots, /useStore\([^)]*\.transform\[2\]/)).toEqual([]);
  });

  it('侧边栏重内容按过渡时长延迟卸载，不按 isOpen 直接卸载', () => {
    // AppDetailPanelModal 用 CSS transition 收宽高。收起的瞬间就卸载，内容会在动画第一帧消失，
    // 只剩空壳在缩；一直挂着又会让重内容跟着每次文档提交白重渲染。
    // 三个重内容调用点必须走 usePanelContentMounted；ChatTest 要保住对话状态，常驻不门控。
    const panelCallSites = [
      join(detailRoot, 'PublishHistoriesSlider.tsx'),
      join(flowRoot, 'NodeTemplatesModal.tsx'),
      join(flowRoot, 'SystemConfigDrawer.tsx')
    ];
    expect(scan(panelCallSites, /usePanelContentMounted\(isOpen\)/).length).toBe(3);
    expect(scan(panelCallSites, /\{\s*isOpen\s*&&|\bisOpen\s*\?\s*\(/)).toEqual([]);
  });

  it('renderer 层 Provider 零 adapter hook', () => {
    // Flow/canvas/ 下的 Provider 在 runtime hydrate 之前就要渲染（initRuntime 在页面的 useMount 里），
    // 而 WorkflowEditorProvider 在 hydrate 之前刻意不给 adapter，所有 adapter hook 都直接抛错。
    // 这一层只能走 host 通道（`@/web/core/workflow/editor/session/workflowSession`，runtime 为 null 时返回 undefined）。
    expect(scan([join(flowRoot, 'context')], /from\s+'@\/web\/core\/workflow\/editor'/)).toEqual(
      []
    );
  });
});
