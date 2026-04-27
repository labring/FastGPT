import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatRoleEnum, ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const mockGetFileContentFromLinks = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/workflow/utils/file', () => ({
  getFileContentFromLinks: mockGetFileContentFromLinks
}));

import {
  dispatchReadFiles,
  getHistoryFileLinks
} from '@fastgpt/service/core/workflow/dispatch/tools/readFiles';

const baseProps = {
  requestOrigin: 'http://localhost:3000',
  runningUserInfo: { teamId: 'team-1', tmbId: 'tmb-1' },
  histories: [] as ChatItemMiniType[],
  chatConfig: {} as any,
  node: { version: '490' } as any,
  params: { fileUrlList: [] as string[] },
  usageId: 'usage-1'
} as any;

describe('dispatchReadFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileContentFromLinks.mockResolvedValue([]);
  });

  it('成功读取并返回文本/原始响应/节点响应/工具响应结构', async () => {
    mockGetFileContentFromLinks.mockResolvedValue([
      { success: true, filename: 'a.pdf', url: '/a.pdf', content: 'Alpha' },
      { success: true, filename: 'b.pdf', url: '/b.pdf', content: 'Beta' }
    ]);

    const result = await dispatchReadFiles({
      ...baseProps,
      params: { fileUrlList: ['/a.pdf', '/b.pdf'] }
    });

    expect(mockGetFileContentFromLinks).toHaveBeenCalledWith({
      urls: ['/a.pdf', '/b.pdf'],
      requestOrigin: 'http://localhost:3000',
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      customPdfParse: false,
      usageId: 'usage-1'
    });

    const text = result.data?.[NodeOutputKeyEnum.text];
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('a.pdf');
    expect(text).toContain('b.pdf');

    expect(result.data?.[NodeOutputKeyEnum.rawResponse]).toEqual([
      { filename: 'a.pdf', url: '/a.pdf', text: 'Alpha' },
      { filename: 'b.pdf', url: '/b.pdf', text: 'Beta' }
    ]);

    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse] as any;
    expect(nodeResponse.readFiles).toEqual([
      { name: 'a.pdf', url: '/a.pdf' },
      { name: 'b.pdf', url: '/b.pdf' }
    ]);
    expect(nodeResponse.readFilesResult).toContain('## a.pdf');
    expect(nodeResponse.readFilesResult).toContain('Alpha');
    expect(nodeResponse.readFilesResult).toContain('## b.pdf');
    expect(nodeResponse.readFilesResult).toContain('Beta');

    expect(result[DispatchNodeResponseKeyEnum.toolResponses]).toEqual({
      fileContent: text
    });
  });

  it('chatConfig 提供 maxFiles 和 customPdfParse 时按其值传入', async () => {
    await dispatchReadFiles({
      ...baseProps,
      chatConfig: {
        fileSelectConfig: {
          maxFiles: 5,
          customPdfParse: true
        }
      },
      params: { fileUrlList: ['/a.pdf'] }
    });

    expect(mockGetFileContentFromLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        maxFiles: 5,
        customPdfParse: true
      })
    );
  });

  it('chatConfig 缺失时 maxFiles 兜底为 20，customPdfParse 兜底为 false', async () => {
    await dispatchReadFiles({
      ...baseProps,
      chatConfig: undefined,
      params: { fileUrlList: ['/a.pdf'] }
    });

    expect(mockGetFileContentFromLinks).toHaveBeenCalledWith(
      expect.objectContaining({ maxFiles: 20, customPdfParse: false })
    );
  });

  it('fileSelectConfig.maxFiles 为 0/undefined 时仍兜底为 20', async () => {
    await dispatchReadFiles({
      ...baseProps,
      chatConfig: { fileSelectConfig: { maxFiles: 0 } },
      params: { fileUrlList: ['/a.pdf'] }
    });

    expect(mockGetFileContentFromLinks).toHaveBeenCalledWith(
      expect.objectContaining({ maxFiles: 20 })
    );
  });

  it('node.version === "489" 时拼接 histories 中的文件链接', async () => {
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            file: {
              type: ChatFileTypeEnum.file,
              name: 'history.pdf',
              url: '/history.pdf'
            }
          }
        ]
      }
    ];

    await dispatchReadFiles({
      ...baseProps,
      node: { version: '489' },
      histories,
      params: { fileUrlList: ['/current.pdf'] }
    });

    expect(mockGetFileContentFromLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: ['/current.pdf', '/history.pdf']
      })
    );
  });

  it('node.version !== "489" 时忽略 histories', async () => {
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            file: {
              type: ChatFileTypeEnum.file,
              name: 'history.pdf',
              url: '/history.pdf'
            }
          }
        ]
      }
    ];

    await dispatchReadFiles({
      ...baseProps,
      node: { version: '490' },
      histories,
      params: { fileUrlList: ['/current.pdf'] }
    });

    expect(mockGetFileContentFromLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: ['/current.pdf']
      })
    );
  });

  it('params.fileUrlList 缺省时按空数组处理', async () => {
    await dispatchReadFiles({
      ...baseProps,
      params: {}
    });

    expect(mockGetFileContentFromLinks).toHaveBeenCalledWith(expect.objectContaining({ urls: [] }));
  });

  it('空文件结果返回空文本和空数组结构', async () => {
    mockGetFileContentFromLinks.mockResolvedValue([]);

    const result = await dispatchReadFiles({
      ...baseProps,
      params: { fileUrlList: [] }
    });

    expect(result.data?.[NodeOutputKeyEnum.text]).toBe('');
    expect(result.data?.[NodeOutputKeyEnum.rawResponse]).toEqual([]);
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse] as any;
    expect(nodeResponse.readFiles).toEqual([]);
    expect(nodeResponse.readFilesResult).toBe('');
    expect(result[DispatchNodeResponseKeyEnum.toolResponses]).toEqual({ fileContent: '' });
  });

  it('超大内容下预览仍按 sliceStrStartEnd 截断 (start/end 各 1000)', async () => {
    const huge = 'x'.repeat(5000);
    mockGetFileContentFromLinks.mockResolvedValue([
      { success: true, filename: 'big.txt', url: '/big.txt', content: huge }
    ]);

    const result = await dispatchReadFiles({
      ...baseProps,
      params: { fileUrlList: ['/big.txt'] }
    });

    const preview = (result[DispatchNodeResponseKeyEnum.nodeResponse] as any)
      .readFilesResult as string;

    // sliceStrStartEnd 在超长文本上会截断中间，preview 长度远小于原文
    expect(preview.length).toBeLessThan(huge.length);
    expect(preview).toContain('## big.txt');
  });

  it('getFileContentFromLinks 抛错时通过 getNodeErrResponse 返回错误结构', async () => {
    mockGetFileContentFromLinks.mockRejectedValue(new Error('boom'));

    const result = await dispatchReadFiles({
      ...baseProps,
      params: { fileUrlList: ['/a.pdf'] }
    });

    expect((result as any).error?.[NodeOutputKeyEnum.errorText]).toBe('boom');
    expect((result[DispatchNodeResponseKeyEnum.nodeResponse] as any).errorText).toBe('boom');
    expect((result[DispatchNodeResponseKeyEnum.toolResponses] as any).error).toBe('boom');
  });
});

describe('getHistoryFileLinks', () => {
  it('空历史返回空数组', () => {
    expect(getHistoryFileLinks([])).toEqual([]);
  });

  it('仅保留 Human 消息中的文件 URL', () => {
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            file: {
              type: ChatFileTypeEnum.file,
              name: 'a.pdf',
              url: '/a.pdf'
            }
          }
        ]
      },
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'AI 不会贡献文件' } }]
      } as any
    ];

    expect(getHistoryFileLinks(histories)).toEqual(['/a.pdf']);
  });

  it('单条消息内多个文件按顺序展开', () => {
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            file: { type: ChatFileTypeEnum.file, name: 'a.pdf', url: '/a.pdf' }
          },
          {
            file: { type: ChatFileTypeEnum.file, name: 'b.pdf', url: '/b.pdf' }
          },
          { text: { content: '附带说明' } }
        ]
      }
    ];

    expect(getHistoryFileLinks(histories)).toEqual(['/a.pdf', '/b.pdf']);
  });

  it('Human 消息中无文件时被过滤', () => {
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: '只是文本' } }]
      }
    ];

    expect(getHistoryFileLinks(histories)).toEqual([]);
  });

  it('混合多条消息时按出现顺序汇总 Human 文件', () => {
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [{ file: { type: ChatFileTypeEnum.file, name: 'a.pdf', url: '/a.pdf' } }]
      },
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: '回答' } }]
      } as any,
      {
        obj: ChatRoleEnum.Human,
        value: [
          { text: { content: '继续' } },
          { file: { type: ChatFileTypeEnum.file, name: 'b.pdf', url: '/b.pdf' } }
        ]
      }
    ];

    expect(getHistoryFileLinks(histories)).toEqual(['/a.pdf', '/b.pdf']);
  });
});
