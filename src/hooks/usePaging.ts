import { useState, useCallback, useEffect } from 'react';
import type { PagingData } from '../types/index';
import { useToast } from './useToast';

export const usePaging = <T = any>({
  api,
  pageSize = 10,
  params = {}
}: {
  api: (data: any) => any;
  pageSize?: number;
  params?: Record<string, any>;
}) => {
  const { toast } = useToast();
  const [data, setData] = useState<T[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoadAll, setIsLoadAll] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [initRequesting, setInitRequesting] = useState(false);

  const getData = useCallback(
    async (num: number, init = false) => {
      if (requesting) return;
      if (!init && isLoadAll) return;
      if (init) {
        setInitRequesting(true);
      }
      setRequesting(true);

      try {
        const res: PagingData<T> = await api({
          pageNum: num,
          pageSize,
          ...params
        });
        setData((state) => {
          const data = init ? res.data : state.concat(res.data);
          if (data.length >= res.total) {
            setIsLoadAll(true);
          }
          setTotal(res.total);
          setPageNum(num);
          return data;
        });
      } catch (error: any) {
        toast({
          title: error?.message || '获取数据异常',
          status: 'error'
        });
        console.log(error);
      }

      setRequesting(false);
      setInitRequesting(false);
      return null;
    },
    [api, isLoadAll, pageSize, params, requesting, toast]
  );

  const nextPage = useCallback(() => {
    if (requesting || isLoadAll) return;
    getData(pageNum + 1);
  }, [getData, isLoadAll, pageNum, requesting]);

  useEffect(() => {
    getData(1, true);
  }, []);

  return {
    pageNum,
    pageSize,
    total,
    data,
    getData,
    requesting,
    isLoadAll,
    nextPage,
    initRequesting,
    setData
  };
};
