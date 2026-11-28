import { describe, expect, it, vi } from 'vitest';
import {
  resolveFolderSyncChildrenChecked,
  toggleFolderSyncChildren
} from '@/pageComponents/dataset/detail/CollectionFolderCard';

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
