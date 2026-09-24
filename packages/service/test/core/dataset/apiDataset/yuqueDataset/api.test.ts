import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn()
}));

vi.mock('../../../../../common/api/axios', () => ({
  createProxyAxios: vi.fn(() => ({
    request: mockRequest
  }))
}));

vi.mock('../../../../../common/logger', () => ({
  getLogger: () => ({
    warn: vi.fn(),
    error: vi.fn()
  }),
  LogCategories: {
    MODULE: {
      DATASET: {
        API_DATASET: 'dataset.apiDataset'
      }
    }
  }
}));

import { useYuqueDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/yuqueDataset/api';

/** 语雀响应体固定包一层 { success, message, data }，request 内部只取 data */
const ok = (data: unknown) => ({ data: { success: true, message: 'ok', data } });

const server = {
  token: 'yuque-token',
  userId: 'yuque-user'
} as any;

/** 一个 TOC：父文档 doc(2000) 下挂子文档 child(2001) */
const TOC = [
  {
    uuid: 'uuid-doc',
    type: 'DOC',
    title: 'Doc',
    url: 'doc',
    slug: 'doc',
    id: '2000',
    doc_id: '2000',
    prev_uuid: '',
    sibling_uuid: '',
    child_uuid: 'uuid-child',
    parent_uuid: ''
  },
  {
    uuid: 'uuid-child',
    type: 'DOC',
    title: 'Child',
    url: 'child',
    slug: 'child',
    id: '2001',
    doc_id: '2001',
    prev_uuid: '',
    sibling_uuid: '',
    child_uuid: '',
    parent_uuid: 'uuid-doc'
  }
];

describe('useYuqueDatasetRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 被测函数名: useYuqueDatasetRequest.getFileDetail  等级: 3-High
   * 思路（回归场景）: listFiles 用复合 id `repoId-docId-uuid`，getFileDetail 曾返回裸 docId。
   * 同步流程把 listFiles 的 id 与本地 apiFileId 比对，两者不同源时每个文档都会被判为
   * 「远端已删除」而删掉重建（每轮同步都重建一次），且被删行的 _id 会被删除集引用。
   * 本用例钉住：两个方法对同一节点给出的 id 必须是同一个。
   */
  it('getFileDetail 返回的 id 与 listFiles 的 id 同源（复合形态）', async () => {
    mockRequest.mockResolvedValue(ok(TOC));
    const request = useYuqueDatasetRequest({ yuqueServer: server });

    const listed = await request.listFiles({ parentId: '100' });
    expect(listed.map((item) => item.id)).toEqual(['100-2000-uuid-doc']);
    // 展开子级时 parentId 传的是父节点的复合 id，产出同样是复合 id
    const children = await request.listFiles({ parentId: '100-2000-uuid-doc' });
    expect(children.map((item) => item.id)).toEqual(['100-2001-uuid-child']);

    const detail = await request.getFileDetail({ apiFileId: '100-2000-uuid-doc' });
    expect(detail.id).toBe('100-2000-uuid-doc');
    // 同一节点的详情 id 必须能在列表里找到，否则同步会走「新增 + 删除」双重路径
    expect(listed.some((item) => item.id === detail.id)).toBe(true);
  });

  /**
   * 被测函数名: useYuqueDatasetRequest.getFileDetail  等级: 3-High
   * 思路（正常场景）: 带子文档的节点要回 hasChild=true、parentId 为父节点的复合 id，
   * 子文档的 parent_uuid 为空时按知识库根处理（parentId 退化为 repoId）
   */
  it('getFileDetail 回传层级字段：hasChild 取 child_uuid，parentId 为父节点复合 id', async () => {
    mockRequest.mockResolvedValue(ok(TOC));
    const request = useYuqueDatasetRequest({ yuqueServer: server });

    const parentDoc = await request.getFileDetail({ apiFileId: '100-2000-uuid-doc' });
    expect(parentDoc.hasChild).toBe(true);
    expect(parentDoc.type).toBe('file');
    // parent_uuid 为空 ⇒ 挂在知识库根，parentId 是裸 repoId
    expect(parentDoc.parentId).toBe('100');

    const childDoc = await request.getFileDetail({ apiFileId: '100-2001-uuid-child' });
    expect(childDoc.hasChild).toBe(false);
    expect(childDoc.parentId).toBe('100-2000-uuid-doc');
  });

  /**
   * 被测函数名: useYuqueDatasetRequest.getFileDetail  等级: 3-High
   * 思路（异常场景）: TOC 里找不到 uuid 时 reject，同步据此判定远端已删除
   */
  it('getFileDetail 在 TOC 中找不到节点时 reject', async () => {
    mockRequest.mockResolvedValue(ok(TOC));
    const request = useYuqueDatasetRequest({ yuqueServer: server });

    await expect(request.getFileDetail({ apiFileId: '100-9999-uuid-missing' })).rejects.toBe(
      '文件不存在'
    );
  });

  /**
   * 被测函数名: useYuqueDatasetRequest.getFileContent  等级: 3-High
   * 思路（回归场景）: 正文接口按 docId 取，必须仍能从复合 id 里解出 docId 与 repoId，
   * 否则复合 id 化之后所有文档都取不到正文
   */
  it('getFileContent 从复合 id 中解出 repoId / docId', async () => {
    mockRequest.mockResolvedValue(ok({ title: 'Doc', body: 'content' }));
    const request = useYuqueDatasetRequest({ yuqueServer: server });

    await expect(request.getFileContent({ apiFileId: '100-2000-uuid-doc' })).resolves.toEqual({
      title: 'Doc',
      rawText: 'content'
    });
    expect(mockRequest.mock.calls[0][0].url).toBe('/api/v2/repos/100/docs/2000');
  });
});
