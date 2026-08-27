import React, { type ReactNode, type RefObject, useRef, useState } from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import { useToast } from './useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useBoolean, useLockFn, useMemoizedFn, useScroll, useThrottleEffect } from 'ahooks';
import MyBox from '../components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useRequest } from './useRequest';
import type { PaginationType, PaginationResponseType } from '@fastgpt/global/openapi/api';

const thresholdVal = 100;

export type ScrollListType = ({
  children,
  ScrollContainerRef,
  isLoading,
  showLoadingOverlay,
  ...props
}: {
  children: ReactNode;
  ScrollContainerRef?: RefObject<HTMLDivElement>;
  isLoading?: boolean;
  showLoadingOverlay?: boolean;
} & BoxProps) => React.JSX.Element;

export function useScrollPagination<
  TParams extends PaginationType,
  TData extends PaginationResponseType
>(
  api: (data: TParams) => Promise<TData>,
  {
    scrollLoadType = 'bottom',

    pageSize = 10,
    params,
    EmptyTip,
    showErrorToast = true,
    disabled = false,
    showNoMoreTip = true,

    ...props
  }: {
    scrollLoadType?: 'top' | 'bottom';

    pageSize?: number;
    params?: Omit<TParams, 'pageNum' | 'offset' | 'pageSize'>;
    EmptyTip?: React.JSX.Element;
    showErrorToast?: boolean;
    disabled?: boolean;
    showNoMoreTip?: boolean;
  } & Parameters<typeof useRequest>[1]
) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [data, setData] = useState<TData['list']>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, { setTrue, setFalse }] = useBoolean(false);
  const requestedOffsetRef = useRef<number>();
  const isEmpty = total === 0 && !isLoading;

  const noMore = data.length >= total;

  const loadData = useLockFn(
    async ({
      init = false,
      ScrollContainerRef,
      silent = false
    }: {
      init?: boolean;
      ScrollContainerRef?: RefObject<HTMLDivElement>;
      silent?: boolean;
    } = {}) => {
      if (noMore && !init) return;

      const offset = init ? 0 : data.length;

      // 请求完成到 React 提交列表更新之间，滚动监听可能再次读到旧 data.length。
      // 用同步游标拦截相同 offset，避免同一页在这个时间窗口被重复请求。
      if (!init && requestedOffsetRef.current === offset) return;
      requestedOffsetRef.current = offset;

      // 静默刷新用于后台校准数据，保留旧列表并避免整块 loading 闪烁。
      if (!silent) {
        setTrue();
      }

      if (init && !silent) {
        setData([]);
        setTotal(0);
      }

      try {
        const res = await api({
          offset,
          pageSize,
          ...params
        } as TParams);

        setTotal(res.total);

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

          const newData = offset === 0 ? res.list : [...res.list, ...data];
          setData(newData);
          adjustScrollPosition();
        } else {
          const newData = offset === 0 ? res.list : [...data, ...res.list];
          setData(newData);
        }
      } catch (error: any) {
        requestedOffsetRef.current = undefined;
        if (showErrorToast) {
          toast({
            title: t(getErrText(error, t('common:core.chat.error.data_error'))),
            status: 'error'
          });
        }
        console.log(error);
      }

      if (!silent) {
        setFalse();
      }
    }
  );

  const ScrollRef = useRef<HTMLDivElement>(null);
  const ScrollData = useMemoizedFn(
    ({
      children,
      ScrollContainerRef,
      isLoading: isLoadingProp,
      showLoadingOverlay = true,
      ...props
    }: {
      isLoading?: boolean;
      showLoadingOverlay?: boolean;
      children: ReactNode;
      ScrollContainerRef?: RefObject<HTMLDivElement>;
    } & BoxProps) => {
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
          if (!ref?.current || noMore || isLoading || data.length === 0) return;
          const { scrollTop, scrollHeight, clientHeight } = ref.current;

          if (
            (scrollLoadType === 'bottom' &&
              scrollTop + clientHeight >= scrollHeight - thresholdVal) ||
            (scrollLoadType === 'top' && scrollTop < thresholdVal)
          ) {
            loadData({ init: false, ScrollContainerRef: ref });
          }
        },
        [scroll],
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
            !isEmpty &&
            !(isLoading && data.length === 0) &&
            (showNoMoreTip || !noMore) && (
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

  return {
    ScrollData,
    isLoading,
    total: Math.max(total, data.length),
    data,
    setData,
    setTotal,
    fetchData: loadData,
    refreshList
  };
}
