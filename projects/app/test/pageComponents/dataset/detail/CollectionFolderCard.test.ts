import { describe, expect, it, vi } from 'vitest';
import {
  createFolderDetailController,
  resolveFolderSyncChildrenChecked,
  toggleFolderSyncChildren
} from '@/pageComponents/dataset/detail/CollectionFolderCard';

type MockFolder = {
  _id: string;
  name: string;
  syncChildren?: boolean;
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('resolveFolderSyncChildrenChecked', () => {
  it('treats folder sync as enabled when dataset syncAll is true even if folder.syncChildren is false', () => {
    expect(
      resolveFolderSyncChildrenChecked({
        datasetSyncAll: true,
        folder: { syncChildren: false }
      })
    ).toBe(true);
  });

  it('follows folder.syncChildren when dataset syncAll is false or undefined', () => {
    expect(
      resolveFolderSyncChildrenChecked({
        datasetSyncAll: false,
        folder: { syncChildren: false }
      })
    ).toBe(false);
    expect(
      resolveFolderSyncChildrenChecked({
        datasetSyncAll: false,
        folder: { syncChildren: true }
      })
    ).toBe(true);
    expect(
      resolveFolderSyncChildrenChecked({
        datasetSyncAll: undefined,
        folder: {}
      })
    ).toBe(true);
  });
});

describe('toggleFolderSyncChildren', () => {
  it('succeeds and commits local state even if background folder and dataset refreshes fail on pause', async () => {
    const saveSyncChildren = vi.fn().mockResolvedValue(undefined);
    const onCommitted = vi.fn();
    const refreshFolder = vi.fn().mockRejectedValue(new Error('folder refresh timeout'));
    const refreshDatasetDetail = vi.fn().mockRejectedValue(new Error('dataset refresh timeout'));

    const result = await toggleFolderSyncChildren({
      syncChildren: false,
      saveSyncChildren,
      onCommitted,
      refreshFolder,
      refreshDatasetDetail
    });

    expect(result).toBe(false);
    expect(saveSyncChildren).toHaveBeenCalledWith(false);
    expect(onCommitted).toHaveBeenCalledWith(false);
    expect(refreshFolder).toHaveBeenCalledTimes(1);
    expect(refreshDatasetDetail).toHaveBeenCalledTimes(1);
  });

  it('does not refresh dataset detail when re-enabling syncChildren', async () => {
    const saveSyncChildren = vi.fn().mockResolvedValue(undefined);
    const onCommitted = vi.fn();
    const refreshFolder = vi.fn().mockResolvedValue(undefined);
    const refreshDatasetDetail = vi.fn().mockResolvedValue(undefined);

    const result = await toggleFolderSyncChildren({
      syncChildren: true,
      saveSyncChildren,
      onCommitted,
      refreshFolder,
      refreshDatasetDetail
    });

    expect(result).toBe(true);
    expect(onCommitted).toHaveBeenCalledWith(true);
    expect(refreshFolder).toHaveBeenCalledTimes(1);
    expect(refreshDatasetDetail).not.toHaveBeenCalled();
  });

  it('propagates save failure without committing local state or triggering refreshes', async () => {
    const saveError = new Error('write failed');
    const saveSyncChildren = vi.fn().mockRejectedValue(saveError);
    const onCommitted = vi.fn();
    const refreshFolder = vi.fn();
    const refreshDatasetDetail = vi.fn();

    await expect(
      toggleFolderSyncChildren({
        syncChildren: false,
        saveSyncChildren,
        onCommitted,
        refreshFolder,
        refreshDatasetDetail
      })
    ).rejects.toThrow('write failed');

    expect(onCommitted).not.toHaveBeenCalled();
    expect(refreshFolder).not.toHaveBeenCalled();
    expect(refreshDatasetDetail).not.toHaveBeenCalled();
  });
});

describe('createFolderDetailController out-of-order response isolation', () => {
  it('ignores an earlier pause refresh that resolves after a subsequent resume write and refresh', async () => {
    const activeCollectionId = 'folder-1';
    let folderState: MockFolder | undefined = {
      _id: 'folder-1',
      name: 'Docs',
      syncChildren: true
    };
    const setFolder = (
      next: MockFolder | undefined | ((prev: MockFolder | undefined) => MockFolder | undefined)
    ) => {
      folderState = typeof next === 'function' ? next(folderState) : next;
    };

    const pauseRefresh = createDeferred<MockFolder>();
    const resumeRefresh = createDeferred<MockFolder>();
    const fetchCollectionById = vi
      .fn<(id: string) => Promise<MockFolder>>()
      .mockReturnValueOnce(pauseRefresh.promise)
      .mockReturnValueOnce(resumeRefresh.promise);

    const controller = createFolderDetailController<MockFolder>({
      getActiveCollectionId: () => activeCollectionId,
      fetchCollectionById,
      setFolder
    });

    const saveSyncChildren = vi.fn().mockResolvedValue(undefined);
    const refreshDatasetDetail = vi.fn().mockResolvedValue(undefined);

    // 1. Pause folder sync: commits false immediately and starts slow background refresh #1
    await toggleFolderSyncChildren({
      syncChildren: false,
      saveSyncChildren,
      onCommitted: (next) =>
        controller.commitFolderPatch('folder-1', (prev) =>
          prev ? { ...prev, syncChildren: next } : prev
        ),
      refreshFolder: () => controller.loadFolder('folder-1'),
      refreshDatasetDetail
    });
    expect(folderState?.syncChildren).toBe(false);

    // 2. Immediately resume folder sync: commits true and finishes refresh #2 first
    await toggleFolderSyncChildren({
      syncChildren: true,
      saveSyncChildren,
      onCommitted: (next) =>
        controller.commitFolderPatch('folder-1', (prev) =>
          prev ? { ...prev, syncChildren: next } : prev
        ),
      refreshFolder: () => controller.loadFolder('folder-1'),
      refreshDatasetDetail
    });
    resumeRefresh.resolve({ _id: 'folder-1', name: 'Docs', syncChildren: true });
    await Promise.resolve();
    expect(folderState?.syncChildren).toBe(true);

    // 3. Stale pause refresh #1 resolves last: must not revert syncChildren back to false
    pauseRefresh.resolve({ _id: 'folder-1', name: 'Docs', syncChildren: false });
    await Promise.resolve();
    expect(folderState?.syncChildren).toBe(true);
  });

  it('prevents an earlier initial load from overwriting a newer committed toggle', async () => {
    let folderState: MockFolder | undefined = {
      _id: 'folder-1',
      name: 'Docs',
      syncChildren: true
    };
    const setFolder = (
      next: MockFolder | undefined | ((prev: MockFolder | undefined) => MockFolder | undefined)
    ) => {
      folderState = typeof next === 'function' ? next(folderState) : next;
    };

    const initialLoad = createDeferred<MockFolder>();
    const controller = createFolderDetailController<MockFolder>({
      getActiveCollectionId: () => 'folder-1',
      fetchCollectionById: () => initialLoad.promise,
      setFolder
    });

    const loadPromise = controller.loadFolder('folder-1');
    controller.commitFolderPatch('folder-1', (prev) =>
      prev ? { ...prev, syncChildren: false } : prev
    );
    expect(folderState?.syncChildren).toBe(false);

    initialLoad.resolve({ _id: 'folder-1', name: 'Docs', syncChildren: true });
    await loadPromise;
    expect(folderState?.syncChildren).toBe(false);
  });

  it('ignores stale folder refresh after navigating to another folder without invalidating the new folder load', async () => {
    let activeCollectionId = 'folder-a';
    let folderState: MockFolder | undefined = {
      _id: 'folder-a',
      name: 'A',
      syncChildren: true
    };
    const setFolder = (
      next: MockFolder | undefined | ((prev: MockFolder | undefined) => MockFolder | undefined)
    ) => {
      folderState = typeof next === 'function' ? next(folderState) : next;
    };

    const loadA = createDeferred<MockFolder>();
    const loadB = createDeferred<MockFolder>();
    const fetchCollectionById = vi
      .fn<(id: string) => Promise<MockFolder>>()
      .mockImplementation((id) => (id === 'folder-a' ? loadA.promise : loadB.promise));

    const controller = createFolderDetailController<MockFolder>({
      getActiveCollectionId: () => activeCollectionId,
      fetchCollectionById,
      setFolder
    });

    const promiseA = controller.loadFolder('folder-a');

    // Navigate to folder-b
    activeCollectionId = 'folder-b';
    controller.invalidate();
    const promiseB = controller.loadFolder('folder-b');

    // Late refresh attempt for inactive folder-a must be a no-op and not invalidate folder-b
    await expect(controller.loadFolder('folder-a')).resolves.toBeUndefined();

    loadB.resolve({ _id: 'folder-b', name: 'B', syncChildren: false });
    await promiseB;
    expect(folderState).toEqual({ _id: 'folder-b', name: 'B', syncChildren: false });

    loadA.resolve({ _id: 'folder-a', name: 'A', syncChildren: true });
    await promiseA;
    expect(folderState).toEqual({ _id: 'folder-b', name: 'B', syncChildren: false });
  });
});
