import { describe, expect, it } from 'vitest';
import {
  extractPageLines,
  postprocessLiteParsePages
} from '@fastgpt/service/worker/readFile/utils/pdfTextPostprocess';

const textItem = ({
  text,
  x = 80,
  y,
  width,
  height = 12,
  fontSize = 12
}: {
  text: string;
  x?: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
}) => ({
  text,
  x,
  y,
  width: width ?? text.length * 12,
  height,
  fontSize
});

describe('pdfTextPostprocess', () => {
  it('按坐标重组同一行，并保守合并中文视觉换行', () => {
    const text = postprocessLiteParsePages([
      {
        height: 1000,
        textItems: [
          textItem({ text: 'AI', x: 80, y: 100, width: 14 }),
          textItem({ text: '技术正在快速发展，带动产业链上下游形成新的增长空间', x: 102, y: 100 }),
          textItem({ text: '也对数据治理、算力供给和模型安全提出更高要求。', y: 120 })
        ]
      }
    ]);

    expect(text).toBe(
      'AI 技术正在快速发展，带动产业链上下游形成新的增长空间也对数据治理、算力供给和模型安全提出更高要求。\n'
    );
  });

  it('保留标题、列表和目录行的段落边界', () => {
    const text = postprocessLiteParsePages([
      {
        height: 1000,
        textItems: [
          textItem({ text: '1.1 发展背景', y: 100 }),
          textItem({ text: '人工智能产业已经进入规模化落地阶段。', y: 120 }),
          textItem({ text: '（一）算力基础设施', y: 160 }),
          textItem({ text: '目录章节................ 12', y: 200 })
        ]
      }
    ]);

    expect(text).toBe(
      '1.1 发展背景\n\n人工智能产业已经进入规模化落地阶段。\n\n（一）算力基础设施\n\n目录章节................ 12\n'
    );
  });

  it('过滤页眉页脚和纯页码', () => {
    const lines = extractPageLines({
      height: 1000,
      textItems: [
        textItem({ text: '页眉噪声', y: 20 }),
        textItem({ text: '正文内容。', y: 120 }),
        textItem({ text: '42', y: 930 }),
        textItem({ text: '页脚噪声', y: 980 })
      ]
    });
    const text = postprocessLiteParsePages([
      {
        height: 1000,
        textItems: lines.map((text, index) => textItem({ text, y: 100 + index * 20 }))
      }
    ]);

    expect(lines).toEqual(['正文内容。', '42']);
    expect(text).toBe('正文内容。\n');
  });

  it('只删除重复噪声整行，不把普通短词从正文中删除', () => {
    const text = postprocessLiteParsePages([
      {
        height: 1000,
        textItems: [
          textItem({ text: '操作', y: 100 }),
          textItem({ text: '操作步骤如下，用户可以按需配置。', y: 120 })
        ]
      },
      {
        height: 1000,
        textItems: [textItem({ text: '操作', y: 100 }), textItem({ text: '第二页正文。', y: 120 })]
      },
      {
        height: 1000,
        textItems: [textItem({ text: '操作', y: 100 }), textItem({ text: '第三页正文。', y: 120 })]
      }
    ]);

    expect(text).toContain('操作步骤如下，用户可以按需配置。');
    expect(text).not.toContain('\n\n操作\n\n');
  });
});
