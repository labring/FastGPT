import { describe, expect, it, vi } from 'vitest';
import {
  getDatasets,
  getDatasetsByAppIdAndDatasetIds,
  getDatasetPaths,
  getDatasetById,
  postCreateDataset,
  putDatasetById,
  delDatasetById,
  postWebsiteSync,
  postCreateDatasetFolder,
  resumeInheritPer,
  postChangeOwner,
  postSearchText,
  getDatasetCollections,
  getQuoteData
} from '@/web/core/dataset/api';
import { GET, POST, PUT, DELETE } from '@/web/common/api/request';

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn(() => Promise.resolve()),
  PUT: vi.fn(),
  DELETE: vi.fn()
}));

describe('dataset api', () => {
  it('should call getDatasets correctly', async () => {
    const mockData = { searchText: 'test' };
    await getDatasets(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/list', mockData);
  });

  it('should call getDatasetsByAppIdAndDatasetIds correctly', async () => {
    const mockData = { appId: '123', datasetIdList: ['1', '2'] };
    await getDatasetsByAppIdAndDatasetIds(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/listByAppIdAndDatasetIds', mockData);
  });

  it('should call getDatasetPaths correctly', async () => {
    const mockData = { sourceId: '123' };
    await getDatasetPaths(mockData);
    expect(GET).toHaveBeenCalledWith('/core/dataset/paths', mockData);
  });

  it('should return empty array for getDatasetPaths when no sourceId', async () => {
    const result = await getDatasetPaths({});
    expect(result).toEqual([]);
  });

  it('should call getDatasetById correctly', async () => {
    const id = '123';
    await getDatasetById(id);
    expect(GET).toHaveBeenCalledWith(`/core/dataset/detail?id=${id}`);
  });

  it('should call postCreateDataset correctly', async () => {
    const mockData = { name: 'test' };
    await postCreateDataset(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/create', mockData);
  });

  it('should call putDatasetById correctly', async () => {
    const mockData = { id: '123', name: 'test' };
    await putDatasetById(mockData);
    expect(PUT).toHaveBeenCalledWith('/core/dataset/update', mockData);
  });

  it('should call delDatasetById correctly', async () => {
    const id = '123';
    await delDatasetById(id);
    expect(DELETE).toHaveBeenCalledWith(`/core/dataset/delete?id=${id}`);
  });

  it('should call postWebsiteSync correctly', async () => {
    const mockData = { url: 'test.com' };
    await postWebsiteSync(mockData);
    expect(POST).toHaveBeenCalledWith('/proApi/core/dataset/websiteSync', mockData, {
      timeout: 600000
    });
  });

  it('should call postCreateDatasetFolder correctly', async () => {
    const mockData = { name: 'folder' };
    await postCreateDatasetFolder(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/folder/create', mockData);
  });

  it('should call resumeInheritPer correctly', async () => {
    const datasetId = '123';
    await resumeInheritPer(datasetId);
    expect(GET).toHaveBeenCalledWith('/core/dataset/resumeInheritPermission', { datasetId });
  });

  it('should call postChangeOwner correctly', async () => {
    const mockData = { ownerId: '123', datasetId: '456' };
    await postChangeOwner(mockData);
    expect(POST).toHaveBeenCalledWith('/proApi/core/dataset/changeOwner', mockData);
  });

  it('should call postSearchText correctly', async () => {
    const mockData = { text: 'test' };
    await postSearchText(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/searchTest', mockData);
  });

  it('should call getDatasetCollections correctly', async () => {
    const mockData = { datasetId: '123' };
    await getDatasetCollections(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/collection/listV2', mockData);
  });

  it('should call getQuoteData correctly', async () => {
    const mockData = { id: '123', quoteId: '456' };
    await getQuoteData(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/data/getQuoteData', mockData);
  });
});
