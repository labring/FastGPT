import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiDatasetMockServer } from '@test/mockserver/dataset';

vi.mock('../../../../common/api/axios', async (importOriginal) => {
  const axios = (await import('axios')).default;
  return {
    ...(await importOriginal<object>()),
    createProxyAxios: (config: any) => axios.create(config),
    axiosWithoutSSRF: axios
  };
});

vi.mock('@fastgpt/dal/redis/caches', () => ({
  DingtalkAccessTokenCache: class {
    async getOrRefresh({ fetchToken }: any) {
      const res = await fetchToken();
      return res.accessToken;
    }
  }
}));

import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/custom/api';
import { useFeishuDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/feishuDataset/api';
import { useDingtalkDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/dingtalkDataset/api';
import { useYuqueDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/yuqueDataset/api';
import {
  buildApiFileTree,
  buildApiFileRecords
} from '@fastgpt/service/core/dataset/apiDataset/tree';
import { serviceEnv } from '@fastgpt/service/env';

describe('Mock Server Integration for API/Feishu/Dingtalk/Yuque Providers', () => {
  const mockServer = new ApiDatasetMockServer();

  beforeAll(async () => {
    const { baseUrl } = await mockServer.start();
    serviceEnv.FEISHU_BASE_URL = baseUrl;
    serviceEnv.DINGTALK_BASE_URL = baseUrl;
    serviceEnv.DINGTALK_OAPI_BASE_URL = baseUrl;
    serviceEnv.YUQUE_BASE_URL = baseUrl;
    serviceEnv.YUQUE_DATASET_BASE_URL = baseUrl;
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.initDefaultData();
  });

  describe('1. 自定义 API 知识库真实通信', () => {
    it('通过 HTTP 真实接口列举目录与文件，递归拉取整树', async () => {
      const request = useApiDatasetRequest({
        apiServer: {
          baseUrl: mockServer.baseUrl,
          authorization: 'test-token'
        }
      });

      const rootFiles = await request.listFiles({ parentId: 'root' });
      expect(rootFiles).toHaveLength(2);
      expect(rootFiles.find((f) => f.id === 'fld-1')).toMatchObject({
        type: 'folder',
        hasChild: true
      });
      expect(rootFiles.find((f) => f.id === 'doc-root')).toMatchObject({
        type: 'file',
        hasChild: false
      });

      const childFiles = await request.listFiles({ parentId: 'fld-1' });
      expect(childFiles).toHaveLength(1);
      expect(childFiles[0]).toMatchObject({ id: 'doc-child', type: 'file' });

      const detail = await request.getFileDetail({ apiFileId: 'fld-1' });
      expect(detail).toMatchObject({ id: 'fld-1', type: 'folder', hasChild: true });

      const content = await request.getFileContent({
        apiFileId: 'doc-child',
        datasetId: 'd1',
        teamId: 't1',
        tmbId: 'tmb1'
      });
      expect(content).toMatchObject({
        title: 'Custom Doc Title',
        rawText: 'Custom Doc Full Content'
      });
    });
  });

  describe('2. 飞书 Drive / Docx 适配器与异常防护 (I01)', () => {
    const feishuServer = {
      appId: 'cli_test',
      appSecret: 'secret_test',
      folderToken: 'fld-root'
    };

    it('正常场景：分别正确探测 docx 与 folder 元数据', async () => {
      const request = useFeishuDatasetRequest({ feishuServer });

      const folderDetail = await request.getFileDetail({ apiFileId: 'fld-sub' });
      expect(folderDetail).toMatchObject({
        id: 'fld-sub',
        name: 'Feishu Sub Folder',
        type: 'folder',
        hasChild: true
      });

      const docDetail = await request.getFileDetail({ apiFileId: 'doc-1' });
      expect(docDetail).toMatchObject({
        id: 'doc-1',
        name: 'Feishu Doc 1',
        type: 'file',
        hasChild: false
      });
    });

    it('真正删除场景：远端 token 不存在时返回文件不存在', async () => {
      mockServer.feishuNotFoundTokens.add('gone-token');
      const request = useFeishuDatasetRequest({ feishuServer });

      await expect(request.getFileDetail({ apiFileId: 'gone-token' })).rejects.toBe('文件不存在');
    });

    it('I01 关键保护：飞书遇到 503 异常时抛错中止，绝不被误判为文件不存在', async () => {
      mockServer.feishu503 = true;
      const request = useFeishuDatasetRequest({ feishuServer });

      await expect(request.getFileDetail({ apiFileId: 'fld-root' })).rejects.toMatchObject({
        status: 503
      });
    });

    it('I01 关键保护：飞书遇到 429 限流时抛错中止，绝不被误判为文件不存在', async () => {
      mockServer.feishu429 = true;
      const request = useFeishuDatasetRequest({ feishuServer });

      await expect(request.getFileDetail({ apiFileId: 'fld-root' })).rejects.toMatchObject({
        status: 429
      });
    });
  });

  describe('3. 钉钉知识库有子节点的在线文档 (I15)', () => {
    const dingtalkServer = {
      appKey: 'ding_key',
      appSecret: 'ding_secret',
      userId: 'user_123',
      rootNodeId: 'root-node'
    };

    it('I15 关键保护：带子节点的 wiki_doc 保留为 file 且 hasChild: true', async () => {
      const request = useDingtalkDatasetRequest({ dingtalkServer });

      const nodes = await request.listFiles({ parentId: 'root-node' });
      const onlineDocWithChildren = nodes.find((n) => n.id === 'doc-with-children');
      expect(onlineDocWithChildren).toBeDefined();
      expect(onlineDocWithChildren!.type).toBe('file');
      expect(onlineDocWithChildren!.hasChild).toBe(true);

      const subNodes = await request.listFiles({ parentId: 'doc-with-children' });
      expect(subNodes).toHaveLength(1);
      expect(subNodes[0]).toMatchObject({
        id: 'sub-doc',
        type: 'file',
        hasChild: false
      });
    });

    it('带子节点的文档通过 tree 模块派生目录并保留正文文件', async () => {
      const request = useDingtalkDatasetRequest({ dingtalkServer });
      const treeNodes = await buildApiFileTree({
        request,
        seeds: [
          {
            id: 'doc-with-children',
            name: 'Online Doc With Children',
            type: 'file',
            hasChild: true
          }
        ]
      });

      const records = buildApiFileRecords(treeNodes);
      const dirRecord = records.find((r) => r.apiFileId === 'doc-with-children#dir');
      const fileRecord = records.find((r) => r.apiFileId === 'doc-with-children');
      const subDocRecord = records.find((r) => r.apiFileId === 'sub-doc');

      expect(dirRecord).toBeDefined();
      expect(dirRecord!.type).toBe('folder');

      expect(fileRecord).toBeDefined();
      expect(fileRecord!.type).toBe('file');
      expect(fileRecord!.parentDirId).toBe('doc-with-children#dir');

      expect(subDocRecord).toBeDefined();
      expect(subDocRecord!.type).toBe('file');
      expect(subDocRecord!.parentDirId).toBe('doc-with-children#dir');
    });
  });

  describe('4. 语雀知识库契约一致性与 TOC 缓存 (I04, I11)', () => {
    const yuqueServer = {
      token: 'yuque_token',
      userId: 'group_100'
    };

    it('I04 关键保护：知识库根 getFileDetail 返回 string ID 且 type 始终为 folder', async () => {
      const request = useYuqueDatasetRequest({ yuqueServer });

      const repoList = await request.listFiles({});
      expect(repoList).toHaveLength(1);
      expect(repoList[0]).toMatchObject({
        id: '1001',
        type: 'folder',
        hasChild: true
      });

      const repoDetail = await request.getFileDetail({ apiFileId: '1001' });
      expect(repoDetail.id).toBe('1001');
      expect(repoDetail.rawId).toBe('1001');
      expect(repoDetail.type).toBe('folder');
      expect(repoDetail.hasChild).toBe(true);
    });

    it('I11 关键保护：同一实例多次读取同一知识库子目录时复用 TOC 缓存', async () => {
      const request = useYuqueDatasetRequest({ yuqueServer });

      await request.listFiles({ parentId: '1001' });
      const callsAfterFirst = mockServer.yuqueTocCalls;
      expect(callsAfterFirst).toBe(1);

      await request.listFiles({ parentId: '1001-u-fld1-u-doc1' });
      expect(mockServer.yuqueTocCalls).toBe(1);
    });
  });
});
