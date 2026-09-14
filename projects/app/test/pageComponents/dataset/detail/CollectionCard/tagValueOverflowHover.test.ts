import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8');

describe('tag filter overflow hover tooltip', () => {
  it('ArrayTagSelect 选项列表项：超长值截断并配置 MyTooltip showOnlyWhenOverflow', () => {
    const source = readProjectFile(
      'src/pageComponents/dataset/detail/CollectionCard/TagValueInputs.tsx'
    );

    expect(source).toContain("import MyTooltip from '@fastgpt/web/components/common/MyTooltip'");

    // 下拉选项
    const arrayTagSelectIndex = source.indexOf('export const ArrayTagSelect');
    expect(arrayTagSelectIndex).toBeGreaterThanOrEqual(0);
    const arrayTagSelectSnippet = source.slice(arrayTagSelectIndex);

    const optionIndex = arrayTagSelectSnippet.indexOf('filteredOptions.map((opt)');
    expect(optionIndex).toBeGreaterThanOrEqual(0);
    const optionSnippet = arrayTagSelectSnippet.slice(optionIndex, optionIndex + 2500);

    expect(optionSnippet).toContain('label={opt}');
    expect(optionSnippet).toContain('showOnlyWhenOverflow');
    expect(optionSnippet).toContain('textOverflow');

    // 已选 Chip
    const chipIndex = source.indexOf('const ArraySelectedChip');
    expect(chipIndex).toBeGreaterThanOrEqual(0);
    const chipSnippet = source.slice(chipIndex, chipIndex + 1000);

    expect(chipSnippet).toContain('label={opt}');
    expect(chipSnippet).toContain('showOnlyWhenOverflow');
    expect(chipSnippet).toContain("maxW={'100%'}");
    expect(chipSnippet).toContain("flex={'0 1 auto'}");
    expect(chipSnippet).toContain('textOverflow');

    // joined 模式宽度解绑
    expect(source).toContain('matchWidth={!joined}');
    expect(source).toContain("w={joined ? '240px' : '370px'}");
  });

  it('TagFilterFieldSelect 字段选择器：已选标签与列表项配置 MyTooltip showOnlyWhenOverflow', () => {
    const source = readProjectFile('src/components/core/dataset/TagFilterSelects.tsx');

    expect(source).toContain("import MyTooltip from '@fastgpt/web/components/common/MyTooltip'");
    expect(source).toContain('label={selectedLabel}');
    expect(source).toContain('label={item.label}');
    expect(source).toContain('showOnlyWhenOverflow');
  });
});
