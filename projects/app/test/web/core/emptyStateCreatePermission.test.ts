import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 回归守卫：无资源 + 无创建权限时，空状态不应再提示「去创建」。
 *
 * 现象（bug）：
 *  - AgentV2 选择技能弹窗：无技能且无创建技能权限时，只显示「您还没有技能」。
 *  - Agent 选择知识库弹窗：无知识库且无创建知识库权限时，仍提示「先创建一个吧」。
 *  - 知识库列表页：无知识库且无创建知识库权限时，仍提示「快去创建一个吧！」。
 *
 * 根因：三处空状态都把「没有资源」与「没有创建权限」合并成了同一条「去创建」文案；
 * 创建按钮本身已按权限正确隐藏，但 EmptyTip 的 text 文案没有按创建权限分支，
 * 于是无权限用户看到「去创建吧」却没有任何创建入口、也没有任何权限说明。
 *
 * 本测试沿用 test/pageComponents/chat/appNameOverflowHover.test.ts 的「源码结构扫描」范式
 * （仓库不做 React 组件渲染测试）。每个空状态覆盖三类回归场景：
 *  - 无创建权限（BUG）：创建引导 EmptyTip 的 text 必须按创建权限分支（引用权限标识）。
 *  - 有创建权限（合法）：创建引导文案 key 与创建按钮权限门控仍保留。
 *  - 已有资源：非空渲染路径仍由 length 判断，空状态不被误触发。
 *
 * 说明：若后续修复改用「两个 EmptyTip + 外层条件」等非 text 内联三元结构，需同步调整判定。
 */

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8');

/** 创建权限相关标识符（覆盖 hasXxxCreatePer，以及下沉到子组件后可能改名的 canCreate 等）。 */
const CREATE_PERMISSION_IDS = [
  'hasDatasetCreatePer',
  'hasSkillCreatePer',
  'canCreateDataset',
  'canCreateSkill',
  'canCreate'
];

/**
 * 提取源码中所有 <EmptyTip ... text={ ... } ... /> 的 text 表达式片段。
 * 用花括号平衡匹配，避免被文案里的 '}' 截断；只取 EmptyTip 元素自身的 text 属性，
 * 不误伤同文件其它用途的 EmptyTip（如 folder.empty / No_selected_dataset）。
 */
const extractEmptyTipTextExpressions = (src: string): string[] => {
  const exprs: string[] = [];
  let searchFrom = 0;
  while (true) {
    const start = src.indexOf('<EmptyTip', searchFrom);
    if (start < 0) break;
    const selfClose = src.indexOf('/>', start);
    const openClose = src.indexOf('>', start);
    const candidates = [selfClose, openClose].filter((i) => i >= 0);
    const tagEnd = candidates.length ? Math.min(...candidates) : src.length;
    const tag = src.slice(start, tagEnd);
    searchFrom = tagEnd + 1;

    const textIdx = tag.indexOf('text={');
    if (textIdx < 0) continue;
    let depth = 0;
    let i = textIdx + 'text='.length; // 指向 '{'
    for (; i < tag.length; i++) {
      if (tag[i] === '{') depth++;
      else if (tag[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    exprs.push(tag.slice(textIdx + 'text='.length, i + 1));
  }
  return exprs;
};

/** 是否存在任一 EmptyTip 的 text 表达式引用了创建权限标识（即空状态文案已按权限分支）。 */
const emptyStateTextBranchesOnCreatePermission = (src: string): boolean => {
  const exprs = extractEmptyTipTextExpressions(src);
  return exprs.some((expr) => CREATE_PERMISSION_IDS.some((id) => expr.includes(id)));
};

describe('空状态：无资源 + 无创建权限时不应提示「去创建」', () => {
  describe('AgentV2 选择技能弹窗 SkillSelectModal', () => {
    const FILE =
      'src/pageComponents/app/detail/Edit/FormComponent/ToolSelector/SkillSelectModal.tsx';

    it('无创建权限：空且无创建技能权限时不再只渲染「您还没有技能」，EmptyTip 文案按 hasSkillCreatePer 分支', () => {
      const src = readSource(FILE);
      expect(
        emptyStateTextBranchesOnCreatePermission(src),
        'AgentV2 选择技能弹窗：资源为空且无创建技能权限时，空状态不应仍渲染「您还没有技能」(skill:no_skills)，' +
          '需按 hasSkillCreatePer 分支为无权限提示。'
      ).toBe(true);
    });

    it('有创建权限：有创建技能权限且为空时仍保留创建入口与「您还没有技能」文案（回归保护）', () => {
      const src = readSource(FILE);
      expect(src).toContain('hasSkillCreatePer');
      expect(src).toContain('skill:no_skills');
    });

    it('已有资源：非空时仍由列表渲染，空状态不被误触发（回归保护）', () => {
      const src = readSource(FILE);
      expect(src).toMatch(/skillList\.length/);
      expect(src).toContain('skillList.map');
    });
  });

  describe('Agent 选择知识库弹窗 DatasetSelectModal', () => {
    const FILE = 'src/components/core/app/DatasetSelectModal.tsx';

    it('无创建权限：空且无创建知识库权限时不再提示「先创建一个吧」，EmptyTip 文案按 hasDatasetCreatePer 分支', () => {
      const src = readSource(FILE);
      expect(
        emptyStateTextBranchesOnCreatePermission(src),
        'Agent 选择知识库弹窗：资源为空且无创建知识库权限时，空状态不应仍渲染「先创建一个吧」(app:dataset_empty_tips)，' +
          '需按 hasDatasetCreatePer 分支为无权限提示。'
      ).toBe(true);
    });

    it('有创建权限：有创建知识库权限且为空时仍保留创建入口与「先创建一个吧」文案（回归保护）', () => {
      const src = readSource(FILE);
      expect(src).toContain('hasDatasetCreatePer');
      expect(src).toContain('app:dataset_empty_tips');
    });

    it('已有资源：非空时仍由列表渲染，空状态不被误触发（回归保护）', () => {
      const src = readSource(FILE);
      expect(src).toContain('isRootEmpty');
      expect(src).toMatch(/datasets\.length/);
    });
  });

  describe('知识库列表页 List.tsx', () => {
    const LIST_FILE = 'src/pageComponents/dataset/list/List.tsx';
    const PAGE_FILE = 'src/pages/dataset/list/index.tsx';

    it('无创建权限：空且无创建知识库权限时不再提示「快去创建一个吧！」，EmptyTip 文案按创建权限分支', () => {
      const src = readSource(LIST_FILE);
      expect(
        emptyStateTextBranchesOnCreatePermission(src),
        '知识库列表页 List.tsx：资源为空且无创建知识库权限时，空状态不应仍渲染「快去创建一个吧！」' +
          '(common:core.dataset.Empty Dataset Tips)，需按创建权限分支为无权限提示（权限已下沉到 List.tsx）。'
      ).toBe(true);
    });

    it('有创建权限：有创建知识库权限且为空时，页头仍保留创建入口、空状态仍保留创建引导文案（回归保护）', () => {
      expect(readSource(PAGE_FILE)).toContain('hasDatasetCreatePer');
      expect(readSource(LIST_FILE)).toContain('Empty Dataset Tips');
    });

    it('已有资源：非空时仍由列表渲染，空状态不被误触发（回归保护）', () => {
      const listSrc = readSource(LIST_FILE);
      expect(listSrc).toContain('myDatasets.length === 0');
      expect(listSrc).toMatch(/renderDatasetCard|renderVirtualGridItems/);
    });
  });
});
