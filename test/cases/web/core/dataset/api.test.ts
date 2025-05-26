import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '@/web/core/dataset/api';
import { POST, GET, PUT, DELETE } from '@/web/common/api/request';

vi.mock('@/web/common/api/request', () => ({
  POST: vi.fn(() => Promise.resolve()),
  GET: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn()
}));

describe('dataset api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should get datasets', async () => {
    const mockData = { searchText: 'test' };
    await api.getDatasets(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/list', mockData);
  });

  it('should get datasets by app id and dataset ids', async () => {
    const mockData = {
      appId: 'app1',
      datasetIdList: ['id1', 'id2']
    };
    await api.getDatasetsByAppIdAndDatasetIds(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/listByAppIdAndDatasetIds', mockData);
  });

  it('should get dataset paths', async () => {
    const mockData = {
      sourceId: 'source1'
    };
    await api.getDatasetPaths(mockData);
    expect(GET).toHaveBeenCalledWith('/core/dataset/paths', mockData);
  });

  it('should return empty array if no sourceId', async () => {
    const result = await api.getDatasetPaths({});
    expect(result).toEqual([]);
    expect(GET).not.toHaveBeenCalled();
  });

  it('should get dataset by id', async () => {
    const id = 'dataset1';
    await api.getDatasetById(id);
    expect(GET).toHaveBeenCalledWith(`/core/dataset/detail?id=${id}`);
  });

  it('should create dataset', async () => {
    const mockData = {
      name: 'Test Dataset'
    };
    await api.postCreateDataset(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/create', mockData);
  });

  it('should update dataset', async () => {
    const mockData = {
      id: 'dataset1',
      name: 'Updated Dataset'
    };
    await api.putDatasetById(mockData);
    expect(PUT).toHaveBeenCalledWith('/core/dataset/update', mockData);
  });

  it('should delete dataset', async () => {
    const id = 'dataset1';
    await api.delDatasetById(id);
    expect(DELETE).toHaveBeenCalledWith(`/core/dataset/delete?id=${id}`);
  });

  it('should sync website', async () => {
    const mockData = {
      url: 'http://test.com'
    };
    const mockPostResponse = Promise.resolve();
    vi.mocked(POST).mockReturnValueOnce(mockPostResponse);

    await api.postWebsiteSync(mockData);
    expect(POST).toHaveBeenCalledWith('/proApi/core/dataset/websiteSync', mockData, {
      timeout: 600000
    });
  });

  it('should create dataset folder', async () => {
    const mockData = {
      name: 'Test Folder'
    };
    await api.postCreateDatasetFolder(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/folder/create', mockData);
  });

  it('should resume inherit permission', async () => {
    const datasetId = 'dataset1';
    await api.resumeInheritPer(datasetId);
    expect(GET).toHaveBeenCalledWith('/core/dataset/resumeInheritPermission', { datasetId });
  });

  it('should change owner', async () => {
    const mockData = {
      ownerId: 'user1',
      datasetId: 'dataset1'
    };
    await api.postChangeOwner(mockData);
    expect(POST).toHaveBeenCalledWith('/proApi/core/dataset/changeOwner', mockData);
  });

  it('should backup dataset collection', async () => {
    const file = new File(['test'], 'test.txt');
    const percentListen = vi.fn();
    const datasetId = 'dataset1';

    const formData = new FormData();
    formData.append('file', file, encodeURIComponent(file.name));
    formData.append('data', JSON.stringify({ datasetId }));

    await api.postBackupDatasetCollection({
      file,
      percentListen,
      datasetId
    });

    expect(POST).toHaveBeenCalledWith(
      '/core/dataset/collection/create/backup',
      expect.any(FormData),
      {
        timeout: 600000,
        onUploadProgress: expect.any(Function),
        headers: {
          'Content-Type': 'multipart/form-data; charset=utf-8'
        }
      }
    );
  });

  it('should search text', async () => {
    const mockData = {
      text: 'test'
    };
    await api.postSearchText(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/searchTest', mockData);
  });

  it('should get dataset collections', async () => {
    const mockData = {
      datasetId: 'dataset1'
    };
    await api.getDatasetCollections(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/collection/listV2', mockData);
  });

  it('should get dataset collection path by id', async () => {
    const parentId = 'parent1';
    await api.getDatasetCollectionPathById(parentId);
    expect(GET).toHaveBeenCalledWith('/core/dataset/collection/paths', { parentId });
  });

  it('should get dataset collection by id', async () => {
    const id = 'collection1';
    await api.getDatasetCollectionById(id);
    expect(GET).toHaveBeenCalledWith('/core/dataset/collection/detail', { id });
  });

  it('should get dataset collection training detail', async () => {
    const collectionId = 'collection1';
    await api.getDatasetCollectionTrainingDetail(collectionId);
    expect(GET).toHaveBeenCalledWith('/core/dataset/collection/trainingDetail', { collectionId });
  });

  it('should create dataset collection', async () => {
    const mockData = {
      name: 'Test Collection'
    };
    await api.postDatasetCollection(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/collection/create', mockData);
  });

  it('should update dataset collection', async () => {
    const mockData = {
      id: 'collection1',
      name: 'Updated Collection'
    };
    await api.putDatasetCollectionById(mockData);
    expect(POST).toHaveBeenCalledWith('/core/dataset/collection/update', mockData);
  });

  it('should delete dataset collection', async () => {
    const mockData = { id: 'collection1' };
    await api.delDatasetCollectionById(mockData);
    expect(DELETE).toHaveBeenCalledWith('/core/dataset/collection/delete', mockData);
  });
});
