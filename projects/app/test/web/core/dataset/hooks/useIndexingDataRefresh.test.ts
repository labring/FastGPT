import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatasetDataList } from '@/web/core/dataset/api/data';
import { useIndexingDataRefresh } from '@/web/core/dataset/hooks/useIndexingDataRefresh';
import { DATASET_STATUS_POLLING_INTERVAL } from '@/web/core/dataset/hooks/useDatasetStatusPolling';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { GetDatasetDataListResponse } from '@fastgpt/global/openapi/core/dataset/data/api';

vi.mock('@/web/core/dataset/api/data', () => ({ getDatasetDataList: vi.fn() }));

type DataList = GetDatasetDataListResponse['list'];
const makeItem = (id: string): DataList[number] => ({
  _id: id,
  datasetId: 'dataset',
  collectionId: 'collection',
  q: 'pending',
  chunkIndex: 0,
  indexStatus: DatasetDataIndexStatusEnum.indexing
});

describe('useIndexingDataRefresh', () => {
  let root: Root;
  let data: DataList;
  let total: number;
  let setData: React.Dispatch<React.SetStateAction<DataList>>;
  let visibility: DocumentVisibilityState;
  const Harness = ({ collectionId = 'collection', searchText = '' }) => {
    [data, setData] = useState<DataList>([]);
    const [currentTotal, setTotal] = useState(0);
    total = currentTotal;
    useIndexingDataRefresh({ collectionId, searchText, data, setData, setTotal });
    return null;
  };
  const render = async (props = {}) => {
    await act(async () => root.render(React.createElement(Harness, props)));
  };
  const tick = async () => {
    await act(async () => vi.advanceTimersByTimeAsync(DATASET_STATUS_POLLING_INTERVAL));
  };
  const setVisibility = async (state: DocumentVisibilityState) => {
    visibility = state;
    await act(async () => document.dispatchEvent(new window.Event('visibilitychange')));
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => visibility });
    vi.useFakeTimers();
    vi.mocked(getDatasetDataList).mockReset();
    root = createRoot(document.createElement('div'));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('refreshes all loaded pages without dropping rows and stops after indexing finishes', async () => {
    await render();
    await tick();
    expect(getDatasetDataList).not.toHaveBeenCalled();
    const initial = Array.from({ length: 45 }, (_, i) => makeItem(String(i)));
    await act(async () => setData(initial));
    vi.mocked(getDatasetDataList).mockImplementation(async ({ offset = 0, pageSize = 30 }) => ({
      total: 60,
      list: initial.slice(offset, offset + pageSize).map((item) => ({
        ...item,
        q: 'finished',
        indexStatus: DatasetDataIndexStatusEnum.indexed
      }))
    }));
    await tick();
    expect(getDatasetDataList).toHaveBeenCalledTimes(2);
    expect(getDatasetDataList).toHaveBeenLastCalledWith({
      collectionId: 'collection',
      searchText: '',
      offset: 30,
      pageSize: 15
    });
    expect(data).toHaveLength(45);
    expect(total).toBe(60);
    expect(data.map((item) => item._id)).toEqual(initial.map((item) => item._id));
    expect(data.every((item) => item.q === 'finished')).toBe(true);
    await tick();
    expect(getDatasetDataList).toHaveBeenCalledTimes(2);
  });

  it('retries failed requests without clearing existing rows', async () => {
    await render();
    const initial = [makeItem('1')];
    await act(async () => setData(initial));
    vi.mocked(getDatasetDataList)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        total: 1,
        list: [
          { ...initial[0], indexStatus: DatasetDataIndexStatusEnum.error, indexErrorMsg: 'failed' }
        ]
      });
    await tick();
    expect(data).toBe(initial);
    await tick();
    expect(data[0].indexErrorMsg).toBe('failed');
    await tick();
    expect(getDatasetDataList).toHaveBeenCalledTimes(2);
  });

  it('pauses while hidden and resumes after one interval when visible', async () => {
    await render();
    await act(async () => setData([makeItem('1')]));
    vi.mocked(getDatasetDataList).mockResolvedValue({
      total: 1,
      list: [{ ...makeItem('1'), indexStatus: DatasetDataIndexStatusEnum.indexed }]
    });
    await setVisibility('hidden');
    await tick();
    await tick();
    expect(getDatasetDataList).not.toHaveBeenCalled();
    await setVisibility('visible');
    await act(async () => vi.advanceTimersByTimeAsync(DATASET_STATUS_POLLING_INTERVAL - 1));
    expect(getDatasetDataList).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(data[0].indexStatus).toBe(DatasetDataIndexStatusEnum.indexed);
    expect(getDatasetDataList).toHaveBeenCalledTimes(1);
  });

  it('does not publish a partial page or fetch further pages when hidden mid-request', async () => {
    await render();
    const initial = Array.from({ length: 45 }, (_, i) => makeItem(String(i)));
    await act(async () => setData(initial));
    let resolve!: (value: GetDatasetDataListResponse) => void;
    vi.mocked(getDatasetDataList)
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      )
      .mockImplementation(async ({ offset = 0, pageSize = 30 }) => ({
        total: 45,
        list: initial.slice(offset, offset + pageSize).map((item) => ({
          ...item,
          indexStatus: DatasetDataIndexStatusEnum.indexed
        }))
      }));
    await tick();
    await setVisibility('hidden');
    await act(async () => resolve({ total: 45, list: initial.slice(0, 30) }));
    await tick();
    expect(getDatasetDataList).toHaveBeenCalledTimes(1);
    expect(data).toBe(initial);
    expect(total).toBe(0);
    await setVisibility('visible');
    await tick();
    expect(getDatasetDataList).toHaveBeenCalledTimes(3);
    expect(data).toHaveLength(45);
    expect(total).toBe(45);
  });

  it('waits for a slow round to finish before starting the next interval', async () => {
    await render();
    const initial = [makeItem('1')];
    await act(async () => setData(initial));
    let resolve!: (value: GetDatasetDataListResponse) => void;
    vi.mocked(getDatasetDataList)
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      )
      .mockResolvedValue({
        total: 1,
        list: [{ ...initial[0], indexStatus: DatasetDataIndexStatusEnum.indexed }]
      });
    await tick();
    await tick();
    await tick();
    expect(getDatasetDataList).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ total: 1, list: initial.map((item) => ({ ...item })) }));
    await act(async () => vi.advanceTimersByTimeAsync(DATASET_STATUS_POLLING_INTERVAL - 1));
    expect(getDatasetDataList).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(getDatasetDataList).toHaveBeenCalledTimes(2);
  });

  it('waits for the old request on search change and then fetches the current search', async () => {
    await render();
    const initial = [makeItem('1')];
    await act(async () => setData(initial));
    let resolve!: (value: GetDatasetDataListResponse) => void;
    vi.mocked(getDatasetDataList)
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      )
      .mockResolvedValue({ total: 0, list: [] });
    await tick();
    await render({ searchText: 'other' });
    await tick();
    expect(getDatasetDataList).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ total: 999, list: initial }));
    expect(data).toBe(initial);
    expect(total).toBe(0);
    await tick();
    expect(getDatasetDataList).toHaveBeenCalledTimes(2);
    expect(getDatasetDataList).toHaveBeenLastCalledWith({
      collectionId: 'collection',
      searchText: 'other',
      offset: 0,
      pageSize: 1
    });
    expect(data).toEqual([]);
  });

  it.each([
    {
      pending: DatasetDataIndexStatusEnum.rebuildIndexPending,
      running: DatasetDataIndexStatusEnum.rebuildIndexRunning,
      terminal: DatasetDataIndexStatusEnum.indexed
    },
    {
      pending: DatasetDataIndexStatusEnum.rebuildIndexPending,
      running: DatasetDataIndexStatusEnum.rebuildIndexRunning,
      terminal: DatasetDataIndexStatusEnum.rebuildIndexFailed
    },
    {
      pending: DatasetDataIndexStatusEnum.rebuildSynonymPending,
      running: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
      terminal: DatasetDataIndexStatusEnum.indexed
    },
    {
      pending: DatasetDataIndexStatusEnum.rebuildSynonymPending,
      running: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
      terminal: DatasetDataIndexStatusEnum.rebuildSynonymFailed
    }
  ])(
    'refreshes $pending through $running to $terminal and stops polling',
    async ({ pending, running, terminal }) => {
      await render();
      const initial = {
        ...makeItem('1'),
        indexStatus: pending
      };
      await act(async () => setData([initial]));
      vi.mocked(getDatasetDataList)
        .mockResolvedValueOnce({
          total: 1,
          list: [{ ...initial, indexStatus: running }]
        })
        .mockResolvedValueOnce({
          total: 1,
          list: [{ ...initial, indexStatus: terminal }]
        });

      await tick();
      expect(data[0].indexStatus).toBe(running);
      await tick();
      expect(data[0].indexStatus).toBe(terminal);
      await tick();
      expect(getDatasetDataList).toHaveBeenCalledTimes(2);
    }
  );

  it('removes completed rows that no longer match the search and stops polling', async () => {
    await render({ searchText: 'pending' });
    await act(async () => setData([makeItem('1')]));
    vi.mocked(getDatasetDataList).mockResolvedValue({ total: 0, list: [] });
    await tick();
    expect(data).toEqual([]);
    expect(total).toBe(0);
    await tick();
    expect(getDatasetDataList).toHaveBeenCalledTimes(1);
  });

  it.each(['save', 'collection', 'search', 'unmount'])(
    'ignores in-flight responses after %s',
    async (change) => {
      await render();
      const item = makeItem('1');
      await act(async () => setData([item]));
      let resolve!: (value: GetDatasetDataListResponse) => void;
      vi.mocked(getDatasetDataList).mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      await tick();
      // 请求未结束时不重复发起同一轮轮询。
      await tick();
      expect(getDatasetDataList).toHaveBeenCalledTimes(1);
      if (change === 'save') {
        await act(async () =>
          setData([{ ...item, q: 'manual', indexStatus: DatasetDataIndexStatusEnum.indexed }])
        );
      } else if (change === 'unmount') {
        await act(async () => root.render(null));
      } else {
        await render(change === 'collection' ? { collectionId: 'other' } : { searchText: 'other' });
      }
      await act(async () =>
        resolve({
          total: 1,
          list: [{ ...item, q: 'stale', indexStatus: DatasetDataIndexStatusEnum.indexed }]
        })
      );
      expect(data[0].q).toBe(change === 'save' ? 'manual' : 'pending');
    }
  );
});
