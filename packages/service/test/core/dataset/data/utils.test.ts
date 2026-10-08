import { describe, expect, it } from 'vitest';
import {
  matchDatasetDataMarkdownImages,
  uniqueDatasetDataMarkdownImageUrls
} from '@fastgpt/service/core/dataset/data/utils';

describe('matchDatasetDataMarkdownImages', () => {
  it('图片索引提取地址时排除标题与尖括号，保留完整 raw 供描述回填', () => {
    const node = '![figure](<https://example.com/a).png> "caption")';
    expect(matchDatasetDataMarkdownImages(`text ${node}`)).toEqual([
      { raw: node, alt: 'figure', url: 'https://example.com/a).png', index: 5 }
    ]);
  });

  it('空地址不进入图片索引', () => {
    expect(matchDatasetDataMarkdownImages('![empty](<> "caption")')).toEqual([]);
  });
});

describe('uniqueDatasetDataMarkdownImageUrls', () => {
  it('同一图片的不同标题与目的地址写法只生成一个索引 URL', () => {
    expect(
      uniqueDatasetDataMarkdownImageUrls([
        '![a](https://example.com/a.png "one")',
        "![b](<https://example.com/a.png> 'two')",
        '![c](https://example.com/b.png (three))',
        null,
        undefined,
        ''
      ])
    ).toEqual(['https://example.com/a.png', 'https://example.com/b.png']);
  });
});
