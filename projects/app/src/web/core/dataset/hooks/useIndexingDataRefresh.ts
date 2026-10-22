import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getDatasetDataList } from '../api/data';
import type { GetDatasetDataListResponse } from '@fastgpt/global/openapi/core/dataset/data/api';
import { isDatasetDataProcessing } from '@fastgpt/global/core/dataset/data/utils';
import { DATASET_STATUS_POLLING_INTERVAL } from './useDatasetStatusPolling';

type DataList = GetDatasetDataListResponse['list'];

/**
 * 当前已加载的数据存在待索引、待重建或重建中项时，每轮结束后等待 10 秒再刷新。
 * 页面隐藏时停止调度及后续分页，返回页面后等待一个间隔再继续，避免后台持续扫描。
 * 保留已加载页和滚动位置；切换集合、搜索或列表变化后丢弃旧响应，避免覆盖手动保存。
 */
export const useIndexingDataRefresh = ({
  collectionId,
  searchText,
  data,
  setData,
  setTotal
}: {
  collectionId: string;
  searchText: string;
  data: DataList;
  setData: Dispatch<SetStateAction<DataList>>;
  setTotal: Dispatch<SetStateAction<number>>;
}) => {
  const inFlightRef = useRef<Promise<void>>();

  useEffect(() => {
    if (!collectionId || !data.some((item) => isDatasetDataProcessing(item.indexStatus))) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const isPageVisible = () => document.visibilityState !== 'hidden';
    const refreshData = async () => {
      const refreshed: DataList = [];
      let total = 0;
      // list 接口最多返回 30 条，逐页刷新整个已加载范围，不能静默退回第一页。
      for (let offset = 0; offset < data.length; offset += 30) {
        if (cancelled || !isPageVisible()) return;
        const result = await getDatasetDataList({
          collectionId,
          searchText,
          offset,
          pageSize: Math.min(30, data.length - offset)
        });
        if (cancelled || !isPageVisible()) return;
        refreshed.push(...result.list);
        total = result.total;
      }
      // 重新应用当前搜索结果：索引生成的文本可能使旧条目不再匹配搜索条件。
      // 以列表引用作 CAS，保护请求期间发生的手动保存、删除或加载下一页。
      setData((current) => (current === data ? refreshed : current));
      setTotal(total);
    };
    const scheduleRefresh = () => {
      clearTimeout(timer);
      if (!cancelled && isPageVisible()) {
        timer = setTimeout(refresh, DATASET_STATUS_POLLING_INTERVAL);
      }
    };
    const refresh = async () => {
      if (cancelled || !isPageVisible()) return;
      // 列表变化会重建 effect，但不能与仍在执行的旧轮询重叠。
      if (inFlightRef.current) {
        await inFlightRef.current;
        scheduleRefresh();
        return;
      }
      const request = refreshData().catch(() => {
        // 后台刷新失败不清空列表；下一轮继续读取。
      });
      inFlightRef.current = request;
      await request;
      inFlightRef.current = undefined;
      scheduleRefresh();
    };
    document.addEventListener('visibilitychange', scheduleRefresh);
    scheduleRefresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', scheduleRefresh);
    };
  }, [collectionId, searchText, data, setData, setTotal]);
};
