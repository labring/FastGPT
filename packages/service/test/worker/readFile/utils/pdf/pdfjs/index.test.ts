import { describe, expect, it } from 'vitest';
import { convertPdfJsTokenToTextItem } from '@fastgpt/service/worker/readFile/utils/pdf/pdfjs';

describe('convertPdfJsTokenToTextItem', () => {
  it('将 PDF.js 底部原点基线坐标转换为顶部原点文本框', () => {
    const item = convertPdfJsTokenToTextItem({
      token: {
        str: 'CAS reference number',
        width: 107.384,
        height: 10.5,
        transform: [10.5, 0, 0, 10.5, 46.5, 796.17],
        fontName: 'Arial',
        hasEOL: false
      },
      viewportTransform: [1, 0, 0, -1, 0, 841.92]
    });

    expect(item).toMatchObject({
      text: 'CAS reference number',
      fontName: 'Arial',
      fontSize: 10.5
    });
    expect(item?.x).toBeCloseTo(46.5);
    expect(item?.y).toBeCloseTo(35.25);
    expect(item?.width).toBeCloseTo(107.384);
    expect(item?.height).toBeCloseTo(10.5);
  });

  it('使用 viewport 矩阵正确计算旋转文本的包围盒', () => {
    const item = convertPdfJsTokenToTextItem({
      token: {
        str: 'Rotated content',
        width: 40,
        height: 10,
        transform: [10, 0, 0, 10, 20, 30],
        fontName: 'Helvetica',
        hasEOL: true
      },
      viewportTransform: [0, 1, 1, 0, 0, 0]
    });

    expect(item).toEqual({
      text: 'Rotated content',
      x: 30,
      y: 20,
      width: 10,
      height: 40,
      fontName: 'Helvetica',
      fontSize: 10
    });
  });

  it('忽略空白 token 和无效变换矩阵', () => {
    expect(
      convertPdfJsTokenToTextItem({
        token: {
          str: ' ',
          width: 10,
          height: 10,
          transform: [10, 0, 0, 10, 20, 30],
          fontName: 'Helvetica',
          hasEOL: false
        },
        viewportTransform: [1, 0, 0, -1, 0, 100]
      })
    ).toBeUndefined();
    expect(
      convertPdfJsTokenToTextItem({
        token: {
          str: 'Invalid',
          width: 10,
          height: 10,
          transform: [10, 0],
          fontName: 'Helvetica',
          hasEOL: false
        },
        viewportTransform: [1, 0, 0, -1, 0, 100]
      })
    ).toBeUndefined();
  });
});
