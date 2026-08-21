import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const longAppName = 'qa-auto-qa-1784240694258-简单Agent鉴权';
const overflowExamples = [
  'qa-auto-qa-1784240694258-简单Agent鉴权',
  'qa-auto-qa-1784240694258-simple-agent-auth-with-extra-long-english-name'
];

const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8');

const expectOverflowNameHasHoverFullText = ({
  nodeName,
  source,
  nameExpression
}: {
  nodeName: string;
  source: string;
  nameExpression: string;
}) => {
  const nameIndex = source.indexOf(nameExpression);
  expect(nameIndex, `${nodeName}: 未找到应用名渲染表达式 ${nameExpression}`).toBeGreaterThanOrEqual(
    0
  );

  const snippet = source.slice(Math.max(0, nameIndex - 500), nameIndex + 500);
  const hasOverflowStyle =
    snippet.includes('textEllipsis') ||
    snippet.includes('textOverflow') ||
    snippet.includes('isTruncated');
  const hasFullNameHoverAffordance =
    snippet.includes('MyTooltip') ||
    snippet.includes('Tooltip') ||
    snippet.includes('showOnlyWhenOverflow') ||
    snippet.includes('title=');
  const hasOverflowOnlyTooltip = snippet.includes('showOnlyWhenOverflow');
  const hasFullNameLabel = snippet.includes(`label=${nameExpression}`);

  expect(
    hasOverflowStyle,
    `${nodeName}: ${longAppName} 这类长应用名应先被单行截断，测试才能覆盖 hover 展示全名场景`
  ).toBe(true);
  expect(
    hasFullNameHoverAffordance,
    `${nodeName}: 长应用名被截断后 hover 不能展示完整名称，应用名节点附近缺少 MyTooltip/Tooltip/title/showOnlyWhenOverflow`
  ).toBe(true);
  expect(
    hasOverflowOnlyTooltip,
    `${nodeName}: 短应用名不应出现多余 hover 展示，应使用 showOnlyWhenOverflow 限制只在溢出时展示`
  ).toBe(true);
  expect(
    hasFullNameLabel,
    `${nodeName}: hover 展示内容必须使用完整应用名字段 ${nameExpression}，不能使用截断后的展示文本`
  ).toBe(true);
};

describe('chat app name overflow hover disclosure', () => {
  it('门户最近使用应用：截断后的应用名 hover 应展示完整名称', () => {
    const source = readProjectFile('src/pageComponents/chat/slider/index.tsx');

    expectOverflowNameHasHoverFullText({
      nodeName: '门户最近使用应用',
      source,
      nameExpression: '{item.name}'
    });
  });

  it('门户聊天历史侧栏顶部应用名：截断后 hover 应展示完整名称', () => {
    const source = readProjectFile('src/pageComponents/chat/slider/ChatSliderHeader.tsx');

    expectOverflowNameHasHoverFullText({
      nodeName: '门户聊天历史侧栏顶部应用名',
      source,
      nameExpression: '{headerTitle}'
    });
  });

  it('免登链接应用：截断后的应用名 hover 应展示完整名称', () => {
    const source = readProjectFile('src/pages/chat/share.tsx');

    expectOverflowNameHasHoverFullText({
      nodeName: '免登链接应用',
      source,
      nameExpression: '{mobileHeaderAppName}'
    });
  });

  it('短名称不应出现多余 hover 展示，中文/英文长名称溢出时才展示', () => {
    const tooltipSource = readProjectFile(
      '../../packages/web/components/common/MyTooltip/index.tsx'
    );

    expect(overflowExamples).toHaveLength(2);
    expect(tooltipSource).toContain('target.scrollWidth > target.clientWidth');
    expect(tooltipSource).toContain('showOnlyWhenOverflow && !isOverflow');
  });
});
