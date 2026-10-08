import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getDatasetDataList } from '../api/data';
import type { GetDatasetDataListResponse } from '@fastgpt/global/openapi/core/dataset/data/api';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';

type DataList = GetDatasetDataListResponse['list'];

/**
 * 当前已加载的数据存在待索引、待重建或重建中项时，每 3 秒刷新一次展示数据。
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
  useEffect(() => {
    if (
      !collectionId ||
      !data.some(
        (item) =>
          item.indexStatus === DatasetDataIndexStatusEnum.indexing ||
          item.indexStatus === DatasetDataIndexStatusEnum.waitingRebuild ||
          item.indexStatus === DatasetDataIndexStatusEnum.rebuilding
      )
    )
      return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const refreshed: DataList = [];
        let total = 0;
        // list 接口最多返回 30 条，逐页刷新整个已加载范围，不能静默退回第一页。
        for (let offset = 0; offset < data.length; offset += 30) {
          const result = await getDatasetDataList({
            collectionId,
            searchText,
            offset,
            pageSize: Math.min(30, data.length - offset)
          });
          if (cancelled) return;
          refreshed.push(...result.list);
          total = result.total;
        }
        // 重新应用当前搜索结果：索引生成的文本可能使旧条目不再匹配搜索条件。
        // 以列表引用作 CAS，保护请求期间发生的手动保存、删除或加载下一页。
        setData((current) => (current === data ? refreshed : current));
        setTotal(total);
      } catch {
        // 后台刷新失败不清空列表；下一轮继续读取。
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 3000);
      }
    };
    timer = setTimeout(refresh, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [collectionId, searchText, data, setData, setTotal]);
};
