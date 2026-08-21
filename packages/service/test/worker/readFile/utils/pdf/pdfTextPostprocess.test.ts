import { describe, expect, it } from 'vitest';
import {
  extractPageLines,
  postprocessPdfPages
} from '@fastgpt/service/worker/readFile/utils/pdf/pdfTextPostprocess';

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
    const text = postprocessPdfPages([
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
    const text = postprocessPdfPages([
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

  it('保留单页边缘正文，只过滤明确的纯页码', () => {
    const page = {
      height: 1000,
      textItems: [
        textItem({ text: '顶部唯一正文', y: 20 }),
        textItem({ text: '正文内容。', y: 120 }),
        textItem({ text: '42', y: 930 }),
        textItem({ text: '底部唯一正文。', y: 980 })
      ]
    };

    expect(extractPageLines(page)).toEqual(['顶部唯一正文', '正文内容。', '42', '底部唯一正文。']);

    const text = postprocessPdfPages([page]);
    expect(text).toContain('顶部唯一正文');
    expect(text).toContain('正文内容。');
    expect(text).toContain('底部唯一正文。');
    expect(text).not.toContain('42');
  });

  it('保留跨越顶部裁剪线的 CAS 字段和值', () => {
    const text = postprocessPdfPages([
      {
        height: 841.9199829101562,
        textItems: [
          textItem({
            text: 'CAS reference number',
            x: 46.5,
            y: 36.24755859375,
            width: 107.46748352050781,
            height: 11.718017578125
          }),
          textItem({
            text: 'E4G9AZ2N62V0R6',
            x: 201.0703125,
            y: 36.24755859375,
            width: 91.57049560546875,
            height: 11.718017578125
          }),
          textItem({ text: 'Full name', x: 46.5, y: 66.25, width: 52 }),
          textItem({ text: 'Xiaoxi DU', x: 201.07, y: 66.25, width: 56 })
        ]
      }
    ]);

    expect(text).toContain('CAS reference number E4G9AZ2N62V0R6');
    expect(text).toContain('Full name Xiaoxi DU');
  });

  it('只删除跨页同位置重复的边缘噪声，并保留正文中的同名内容', () => {
    const pages = Array.from({ length: 3 }, (_, index) => ({
      height: 1000,
      textItems: [
        textItem({ text: '内部资料', y: 20 }),
        ...(index === 0 ? [textItem({ text: '内部资料', y: 300 })] : []),
        textItem({ text: `第${index + 1}页正文。`, y: 120 }),
        textItem({ text: '统一页脚', y: 980 })
      ]
    }));

    const text = postprocessPdfPages(pages);

    expect(text.match(/内部资料/g)).toHaveLength(1);
    expect(text).not.toContain('统一页脚');
    expect(text).toContain('第1页正文。');
    expect(text).toContain('第3页正文。');
  });

  it('两页短文档也能识别重复页眉，但位置偏差过大时保留', () => {
    const repeatedHeaderText = postprocessPdfPages([
      {
        height: 1000,
        textItems: [
          textItem({ text: '重复页眉', y: 20 }),
          textItem({ text: '第一页正文。', y: 120 })
        ]
      },
      {
        height: 1000,
        textItems: [
          textItem({ text: '重复页眉', y: 25 }),
          textItem({ text: '第二页正文。', y: 120 })
        ]
      }
    ]);
    const shiftedText = postprocessPdfPages([
      {
        height: 1000,
        textItems: [textItem({ text: '可能是正文', y: 10 })]
      },
      {
        height: 1000,
        textItems: [textItem({ text: '可能是正文', y: 35 })]
      }
    ]);

    expect(repeatedHeaderText).not.toContain('重复页眉');
    expect(shiftedText.match(/可能是正文/g)).toHaveLength(2);
  });

  it('关闭边缘清理时保留重复页眉页脚', () => {
    const text = postprocessPdfPages(
      [
        {
          height: 1000,
          textItems: [textItem({ text: '重复页眉', y: 20 })]
        },
        {
          height: 1000,
          textItems: [textItem({ text: '重复页眉', y: 20 })]
        }
      ],
      { trimPageEdge: false }
    );

    expect(text.match(/重复页眉/g)).toHaveLength(2);
  });

  it('不把多页重复的普通正文短词当作页面噪声', () => {
    const text = postprocessPdfPages([
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
    expect(text.match(/操作/g)).toHaveLength(4);
  });
});
