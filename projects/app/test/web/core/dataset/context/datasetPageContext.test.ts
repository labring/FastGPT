import { describe, expect, it, vi } from 'vitest';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { createDatasetDetailActions } from '@/web/core/dataset/context/datasetPageContext';

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeDatasetDetail = (overrides: Partial<DatasetItemType> = {}): DatasetItemType =>
  ({
    _id: 'dataset-1',
    name: 'API Dataset',
    syncAll: false,
    ...overrides
  }) as DatasetItemType;

describe('createDatasetDetailActions out-of-order response isolation', () => {
  it('ignores an earlier background loadDatasetDetail that resolves after updateDataset enables syncAll', async () => {
    let detailState = makeDatasetDetail({ syncAll: true });
    const setDatasetDetail = (
      next: DatasetItemType | ((prev: DatasetItemType) => DatasetItemType)
    ) => {
      detailState = typeof next === 'function' ? next(detailState) : next;
    };

    const pauseBackgroundFetch = createDeferred<DatasetItemType>();
    const updateRefreshFetch = createDeferred<DatasetItemType>();
    const fetchDatasetById = vi
      .fn<(id: string) => Promise<DatasetItemType>>()
      .mockReturnValueOnce(pauseBackgroundFetch.promise)
      .mockReturnValueOnce(updateRefreshFetch.promise);
    const saveDatasetById = vi.fn().mockResolvedValue(undefined);

    const actions = createDatasetDetailActions({
      getCurrentDatasetId: () => 'dataset-1',
      fetchDatasetById,
      saveDatasetById,
      setDatasetDetail
    });

    // 1. Folder pause commits syncAll=false and starts slow background loadDatasetDetail
    actions.patchDatasetDetail({ syncAll: false });
    expect(detailState.syncAll).toBe(false);
    const backgroundLoadPromise = actions.loadDatasetDetail('dataset-1');

    // 2. User returns to root and enables syncAll=true; updateDataset write + fetch completes first
    const updatePromise = actions.updateDataset({ id: 'dataset-1', syncAll: true });
    updateRefreshFetch.resolve(makeDatasetDetail({ syncAll: true }));
    await updatePromise;
    expect(detailState.syncAll).toBe(true);

    // 3. Stale background loadDatasetDetail resolves last with syncAll=false: must be discarded
    pauseBackgroundFetch.resolve(makeDatasetDetail({ syncAll: false }));
    await backgroundLoadPromise;
    expect(detailState.syncAll).toBe(true);
  });

  it('prevents an earlier loadDatasetDetail from overwriting a newer patchDatasetDetail', async () => {
    let detailState = makeDatasetDetail({ syncAll: true });
    const setDatasetDetail = (
      next: DatasetItemType | ((prev: DatasetItemType) => DatasetItemType)
    ) => {
      detailState = typeof next === 'function' ? next(detailState) : next;
    };

    const earlierFetch = createDeferred<DatasetItemType>();
    const actions = createDatasetDetailActions({
      getCurrentDatasetId: () => 'dataset-1',
      fetchDatasetById: () => earlierFetch.promise,
      saveDatasetById: vi.fn().mockResolvedValue(undefined),
      setDatasetDetail
    });

    const loadPromise = actions.loadDatasetDetail('dataset-1');
    actions.patchDatasetDetail({ syncAll: false });
    expect(detailState.syncAll).toBe(false);

    earlierFetch.resolve(makeDatasetDetail({ syncAll: true }));
    await loadPromise;
    expect(detailState.syncAll).toBe(false);
  });

  it('isolates in-flight detail loads after switching datasets', async () => {
    let currentDatasetId = 'dataset-a';
    let detailState = makeDatasetDetail({ _id: 'dataset-a', syncAll: true });
    const setDatasetDetail = (
      next: DatasetItemType | ((prev: DatasetItemType) => DatasetItemType)
    ) => {
      detailState = typeof next === 'function' ? next(detailState) : next;
    };

    const fetchA = createDeferred<DatasetItemType>();
    const fetchB = createDeferred<DatasetItemType>();
    const actions = createDatasetDetailActions({
      getCurrentDatasetId: () => currentDatasetId,
      fetchDatasetById: (id) => (id === 'dataset-a' ? fetchA.promise : fetchB.promise),
      saveDatasetById: vi.fn().mockResolvedValue(undefined),
      setDatasetDetail
    });

    const promiseA = actions.loadDatasetDetail('dataset-a');

    // Switch to dataset-b
    currentDatasetId = 'dataset-b';
    actions.invalidate();
    const promiseB = actions.loadDatasetDetail('dataset-b');

    fetchB.resolve(makeDatasetDetail({ _id: 'dataset-b', syncAll: false }));
    await promiseB;
    expect(detailState._id).toBe('dataset-b');
    expect(detailState.syncAll).toBe(false);

    fetchA.resolve(makeDatasetDetail({ _id: 'dataset-a', syncAll: true }));
    await promiseA;
    expect(detailState._id).toBe('dataset-b');
    expect(detailState.syncAll).toBe(false);
  });
});
