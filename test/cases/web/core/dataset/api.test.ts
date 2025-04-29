import { describe, expect, it, vi } from 'vitest';
import * as api from '@/web/core/dataset/api';
import { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import { GET, POST, PUT, DELETE } from '@/web/common/api/request';

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn()
}));

describe('dataset api', () => {
  it('should get datasets', async () => {
    const mockResponse = [{ id: '1', name: 'test dataset' }];
    vi.mocked(POST).mockResolvedValueOnce(mockResponse);

    const result = await api.getDatasets({ pageNum: 1, pageSize: 10 });
    expect(result).toEqual(mockResponse);
  });

  it('should get dataset by id', async () => {
    const mockResponse = { id: '1', name: 'test' };
    vi.mocked(GET).mockResolvedValueOnce(mockResponse);

    const result = await api.getDatasetById('1');
    expect(result).toEqual(mockResponse);
  });

  it('should create dataset', async () => {
    const mockId = '123';
    vi.mocked(POST).mockResolvedValueOnce(mockId);

    const result = await api.postCreateDataset({ name: 'test' });
    expect(result).toBe(mockId);
  });

  it('should update dataset', async () => {
    vi.mocked(PUT).mockResolvedValueOnce(undefined);

    await api.putDatasetById({ id: '1', name: 'updated' });
    expect(PUT).toHaveBeenCalled();
  });

  it('should delete dataset', async () => {
    vi.mocked(DELETE).mockResolvedValueOnce(undefined);

    await api.delDatasetById('1');
    expect(DELETE).toHaveBeenCalled();
  });

  it('should get quote data', async () => {
    const mockResponse = { content: 'test quote' };
    vi.mocked(POST).mockResolvedValueOnce(mockResponse);

    const result = await api.getQuoteData({ dataId: '1' });
    expect(result).toEqual(mockResponse);
  });

  it('should sync link collection', async () => {
    vi.mocked(POST).mockResolvedValueOnce(DatasetCollectionSyncResultEnum.success);

    const result = await api.postLinkCollectionSync('1');
    expect(result).toBe(DatasetCollectionSyncResultEnum.success);
  });

  it('should get training queue length', async () => {
    const mockResponse = { queueLen: 5 };
    vi.mocked(GET).mockResolvedValueOnce(mockResponse);

    const result = await api.getTrainingQueueLen();
    expect(result).toEqual(mockResponse);
  });

  it('should get dataset paths', async () => {
    const mockPaths = [{ id: '1', name: 'path1' }];
    vi.mocked(GET).mockResolvedValueOnce(mockPaths);

    const result = await api.getDatasetPaths({ sourceId: '1' });
    expect(result).toEqual(mockPaths);
  });

  it('should return empty array when sourceId is empty for dataset paths', async () => {
    const result = await api.getDatasetPaths({ sourceId: '' });
    expect(result).toEqual([]);
  });

  it('should get dataset collection by id', async () => {
    const mockCollection = { id: '1', name: 'test collection' };
    vi.mocked(GET).mockResolvedValueOnce(mockCollection);

    const result = await api.getDatasetCollectionById('1');
    expect(result).toEqual(mockCollection);
  });

  it('should get dataset data list', async () => {
    const mockResponse = { total: 1, data: [{ id: '1', content: 'test data' }] };
    vi.mocked(POST).mockResolvedValueOnce(mockResponse);

    const result = await api.getDatasetDataList({ datasetId: '1', pageNum: 1, pageSize: 10 });
    expect(result).toEqual(mockResponse);
  });

  it('should get dataset data permission', async () => {
    const mockResponse = { canRead: true };
    vi.mocked(GET).mockResolvedValueOnce(mockResponse);

    const result = await api.getDatasetDataPermission('1');
    expect(result).toEqual(mockResponse);
  });

  it('should handle error when getting dataset by invalid id', async () => {
    const mockError = new Error('Dataset not found');
    vi.mocked(GET).mockRejectedValueOnce(mockError);

    await expect(api.getDatasetById('invalid-id')).rejects.toThrow('Dataset not found');
  });
});
