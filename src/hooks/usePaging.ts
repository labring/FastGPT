import { useState, useCallback } from 'react';
import type { PagingData } from '../types/index';
import { useQuery } from '@tanstack/react-query';

export const usePaging = <T = any>({
  api,
  pageSize = 10,
  params
}: {
  api: (data: any) => Promise<PagingData<T>>;
  pageSize?: number;
  params?: Record<string, any>;
}) => {
  const [data, setData] = useState<T[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoadAll, setIsLoadAll] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const getData = useCallback(
    async (init = false) => {
      if (requesting) return;
      if (!init && isLoadAll) return;
      setRequesting(true);

      try {
        const res = await api({
          pageNum,
          pageSize,
          ...(params ? params : {})
        });
        setData((state) => {
          const data = init ? res.data : state.concat(res.data);
          if (data.length >= res.total) {
            setIsLoadAll(true);
          }
          return data;
        });
        setTotal(res.total);
      } catch (error) {
        console.log(error);
      }

      setRequesting(false);
      return null;
    },
    [api, isLoadAll, pageNum, pageSize, params, requesting]
  );

  useQuery(['init', pageNum], () => getData(pageNum === 1));

  return {
    pageNum,
    pageSize,
    setPageNum,
    total,
    data,
    getData
  };
};
