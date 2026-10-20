import React, { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import { useToast } from './useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useBoolean, useMemoizedFn, useScroll, useThrottleEffect } from 'ahooks';
import MyBox from '../components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useRequest } from './useRequest';
import {
  PaginationPageSizeLimit,
  type PaginationType,
  type PaginationResponseType
} from '@fastgpt/global/openapi/api';

const thresholdVal = 100;

export type ScrollListType = ({
  children,
  ScrollContainerRef,
  isLoading,
  showLoadingOverlay,
  showNoMoreTip,
  showPaginationTip,
  ...props
}: {
  children: ReactNode;
  ScrollContainerRef?: RefObject<HTMLDivElement>;
  isLoading?: boolean;
  showLoadingOverlay?: boolean;
  showNoMoreTip?: boolean;
  showPaginationTip?: boolean;
} & BoxProps) => React.JSX.Element;

/**
 * 管理滚动分页及请求竞争。普通初始化清空列表；静默初始化在响应成功前保留旧快照。
 * 配置 refreshByIds 后按 ID 原位同步条目，保留其他缓存、分页状态及滚动容器。
 */
export function useScrollPagination<
  TParams extends PaginationType,
  TData extends PaginationResponseType
>(
  api: (data: TParams, cancelToken?: AbortController) => Promise<TData>,
  {
    scrollLoadType = 'bottom',

    pageSize = 10,
    params,
    EmptyTip,
    showErrorToast = true,
    disabled = false,
    showNoMoreTip = true,
    showPaginationTip = true,
    refreshByIds,

    ...props
  }: {
    scrollLoadType?: 'top' | 'bottom';

    pageSize?: number;
    params?: Omit<TParams, 'pageNum' | 'offset' | 'pageSize'>;
    EmptyTip?: React.JSX.Element;
    showErrorToast?: boolean;
    disabled?: boolean;
    showNoMoreTip?: boolean;
    showPaginationTip?: boolean;
    refreshByIds?: {
      getId: (item: TData['list'][number]) => string;
      api: (ids: string[], cancelToken?: AbortController) => Promise<TData['list']>;
    };
  } & Parameters<typeof useRequest>[1]
) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [data, setDataState] = useState<TData['list']>([]);
  const dataRef = useRef(data);
  // React 提交前也要读到刚更新的缓存，避免连续请求覆盖上一次局部更新或使用旧 offset。
  const setData = useMemoizedFn((next: React.SetStateAction<TData['list']>) => {
    dataRef.current = typeof next === 'function' ? next(dataRef.current) : next;
    setDataState(dataRef.current);
  });
  const [total, setTotal] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, { setTrue, setFalse }] = useBoolean(false);
  const [error, setError] = useState<Error | null>(null);
  const requestedOffsetRef = useRef<number>();
  const requestControllerRef = useRef<AbortController>();
  const requestIdRef = useRef(0);
  const isRequestingRef = useRef(false);
  const pendingRefreshIdsRef = useRef<string[]>([]);
  const isEmpty = hasLoaded && total === 0 && data.length === 0 && !isLoading;

  const noMore = data.length >= total;

  const loadData = useMemoizedFn(
    async ({
      init = false,
      ScrollContainerRef,
      silent = false,
      itemIds
    }: {
      init?: boolean;
      ScrollContainerRef?: RefObject<HTMLDivElement>;
      silent?: boolean;
      /** 由 refreshItems 发起；使用 ID 接口同步缓存，不走分页接口。 */
      itemIds?: string[];
    } = {}) => {
      const refreshIds =
        itemIds && refreshByIds
          ? [...new Set([...pendingRefreshIdsRef.current, ...itemIds])]
          : undefined;
      if (refreshIds?.length === 0) return;
      if (!init && (noMore || isRequestingRef.current)) return;

      const offset = init ? 0 : dataRef.current.length;

      // 请求完成到 React 提交列表更新之间，滚动监听可能再次读到旧 data.length。
      // 用同步游标拦截相同 offset，避免同一页在这个时间窗口被重复请求。
      if (!init && requestedOffsetRef.current === offset) return;

      if (init) {
        // 新筛选或后台同步都立即接管请求；连续编辑不同资源时合并尚未完成的 ID，避免漏刷。
        requestControllerRef.current?.abort();
        requestedOffsetRef.current = undefined;
        pendingRefreshIdsRef.current = refreshIds ?? [];
      } else {
        requestedOffsetRef.current = offset;
      }

      const requestController = new AbortController();
      const requestId = ++requestIdRef.current;
      requestControllerRef.current = requestController;
      isRequestingRef.current = true;

      // 静默刷新用于后台校准数据，保留旧列表并避免整块 loading 闪烁。
      if (!silent) {
        setTrue();
      } else if (init) {
        setFalse();
      }
      setError(null);

      if (init && !silent) {
        setData([]);
        setTotal(0);
        setHasLoaded(false);
      }

      try {
        if (refreshIds && refreshByIds) {
          const refreshedItems = new Map<string, TData['list'][number]>();
          // 已加载缓存可能超过接口 ID 上限，全部请求成功后再一次性提交快照。
          for (let start = 0; start < refreshIds.length; start += PaginationPageSizeLimit) {
            const list = await refreshByIds.api(
              refreshIds.slice(start, start + PaginationPageSizeLimit),
              requestController
            );
            if (requestController.signal.aborted || requestId !== requestIdRef.current) return;
            list.forEach((item) => refreshedItems.set(refreshByIds.getId(item), item));
          }

          const ids = new Set(refreshIds);
          let removedCount = 0;
          const nextData = dataRef.current.flatMap((item) => {
            const id = refreshByIds.getId(item);
            if (!ids.has(id)) return [item];
            const refreshedItem = refreshedItems.get(id);
            if (refreshedItem !== undefined) return [refreshedItem];
            // 不再可见或不再符合筛选的资源移出缓存，后续分页从收缩后的长度继续。
            removedCount += 1;
            return [];
          });

          setData(nextData);
          // ID 查询的 total 仅对应本次 ID 集合，不能覆盖整个列表的总数。
          setTotal((prev) => Math.max(0, prev - removedCount));
          pendingRefreshIdsRef.current = [];
          return;
        }

        const res = await api(
          {
            offset,
            pageSize,
            ...params
          } as TParams,
          requestController
        );

        if (requestController.signal.aborted || requestId !== requestIdRef.current) return;

        setTotal(res.total);
        if (offset === 0) {
          setHasLoaded(true);
        }

        if (scrollLoadType === 'top') {
          const prevHeight = ScrollContainerRef?.current?.scrollHeight || 0;
          const prevScrollTop = ScrollContainerRef?.current?.scrollTop || 0;

          function adjustScrollPosition() {
            requestAnimationFrame(
              ScrollContainerRef?.current
                ? () => {
                    if (ScrollContainerRef?.current) {
                      const newHeight = ScrollContainerRef.current.scrollHeight;
                      const heightDiff = newHeight - prevHeight;
                      ScrollContainerRef.current.scrollTop = prevScrollTop + heightDiff;
                    }
                  }
                : adjustScrollPosition
            );
          }

          const newData = offset === 0 ? res.list : [...res.list, ...dataRef.current];
          setData(newData);
          adjustScrollPosition();
        } else {
          const newData = offset === 0 ? res.list : [...dataRef.current, ...res.list];
          setData(newData);
        }
      } catch (error: any) {
        if (requestController.signal.aborted || requestId !== requestIdRef.current) return;

        requestedOffsetRef.current = undefined;
        setError(error instanceof Error ? error : new Error(String(error)));
        if (showErrorToast) {
          toast({
            title: t(getErrText(error, t('common:core.chat.error.data_error'))),
            status: 'error'
          });
        }
        console.log(error);
      } finally {
        if (requestId === requestIdRef.current) {
          requestControllerRef.current = undefined;
          isRequestingRef.current = false;
          if (!silent) {
            setFalse();
          }
        }
      }
    }
  );

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      requestControllerRef.current?.abort();
    };
  }, []);

  const ScrollRef = useRef<HTMLDivElement>(null);
  const ScrollData = useMemoizedFn(
    ({
      children,
      ScrollContainerRef,
      isLoading: isLoadingProp,
      showLoadingOverlay = true,
      showNoMoreTip: showNoMoreTipProp,
      showPaginationTip: showPaginationTipProp,
      ...props
    }: {
      isLoading?: boolean;
      showLoadingOverlay?: boolean;
      showNoMoreTip?: boolean;
      showPaginationTip?: boolean;
      children: ReactNode;
      ScrollContainerRef?: RefObject<HTMLDivElement>;
    } & BoxProps) => {
      const finalShowNoMoreTip = showNoMoreTipProp ?? showNoMoreTip;
      const finalShowPaginationTip = showPaginationTipProp ?? showPaginationTip;
      const ref = ScrollContainerRef || ScrollRef;
      const loadText = (() => {
        if (isLoading || isLoadingProp) return t('common:is_requesting');
        if (noMore) return t('common:request_end');
        return t('common:request_more');
      })();

      const scroll = useScroll(ref);

      // Watch scroll position
      useThrottleEffect(
        () => {
          if (!ref?.current || noMore || isLoading || error || data.length === 0) return;
          const { scrollTop, scrollHeight, clientHeight } = ref.current;

          if (
            (scrollLoadType === 'bottom' &&
              scrollTop + clientHeight >= scrollHeight - thresholdVal) ||
            (scrollLoadType === 'top' && scrollTop < thresholdVal)
          ) {
            loadData({ init: false, ScrollContainerRef: ref });
          }
        },
        [error, scroll],
        { wait: 50 }
      );

      return (
        <MyBox
          ref={ref}
          h={'100%'}
          overflow={'auto'}
          display={'flex'}
          flexDirection={'column'}
          isLoading={showLoadingOverlay && (isLoading || isLoadingProp)}
          {...props}
        >
          {scrollLoadType === 'top' && total > 0 && isLoading && (
            <Box mt={2} fontSize={'xs'} color={'blackAlpha.500'} textAlign={'center'}>
              {t('common:is_requesting')}
            </Box>
          )}
          {children}
          {scrollLoadType === 'bottom' &&
            finalShowPaginationTip &&
            !isEmpty &&
            !(isLoading && data.length === 0) &&
            (finalShowNoMoreTip || !noMore) && (
              <Box
                mt={'auto'}
                pt={2}
                fontSize={'xs'}
                color={'blackAlpha.500'}
                textAlign={'center'}
                cursor={loadText === t('common:request_more') ? 'pointer' : 'default'}
                onClick={() => {
                  if (loadText !== t('common:request_more')) return;
                  loadData({ init: false });
                }}
              >
                {loadText}
              </Box>
            )}
          {isEmpty && EmptyTip}
        </MyBox>
      );
    }
  );

  // Reload data
  useRequest(
    async () => {
      if (disabled) return;
      loadData({ init: true });
    },
    {
      manual: false,
      ...props
    }
  );

  const refreshList = useMemoizedFn(() => {
    loadData({ init: true });
  });

  /** 按 ID 同步已加载条目；省略 IDs 时同步整个缓存，返回顺序不影响当前列表顺序。 */
  const refreshItems = useMemoizedFn((ids?: string[]) => {
    if (!refreshByIds) return Promise.resolve();
    return loadData({
      init: true,
      silent: true,
      itemIds: ids ?? dataRef.current.map(refreshByIds.getId)
    });
  });

  return {
    ScrollData,
    isLoading,
    error,
    total: Math.max(total, data.length),
    isEmpty,
    data,
    setData,
    setTotal,
    fetchData: loadData,
    refreshList,
    refreshItems
  };
}
