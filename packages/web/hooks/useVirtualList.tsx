import React, {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import { useEventListener, useMemoizedFn, useScroll, useSize, useThrottleEffect } from 'ahooks';
import type { PaginationType, PaginationResponseType } from '@fastgpt/global/openapi/api';
import { useScrollPagination } from './useScrollPagination';
import { useTranslation } from 'next-i18next';

type VirtualListItem<T> = {
  index: number;
  data: T;
};

type UseVirtualListProps<TParams extends PaginationType> = {
  refreshDeps?: any[];
  itemHeight: number;
  overscan?: number;
  pageSize?: number;
  params?: Omit<TParams, 'pageNum' | 'offset' | 'pageSize'>;
  EmptyTip?: React.JSX.Element;
  showErrorToast?: boolean;
  disabled?: boolean;
  showNoMoreTip?: boolean;
};

type VirtualListProps = {
  children: ReactNode;
} & BoxProps;

const defaultOverscan = 5;
const loadMoreThreshold = 100;
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type VirtualScrollWindowOptions = {
  containerRef: RefObject<HTMLElement>;
  syncWindow: (options?: { usePreload?: boolean }) => void;
  listenToWindow?: boolean;
};

/**
 * 统一虚拟列表的滚动调度。
 * 滚动和 resize 事件只安排一个 animation frame，避免高频事件重复计算窗口；
 * usePreload 由网格的底部观察器使用，用于在进入预加载区域时提前刷新窗口。
 */
export const useVirtualScrollWindow = ({
  containerRef,
  syncWindow,
  listenToWindow = false
}: VirtualScrollWindowOptions) => {
  const animationFrameRef = useRef<number>();
  const shouldUsePreloadRef = useRef(false);
  const syncWindowRef = useMemoizedFn(syncWindow);

  const flushSyncWindow = useMemoizedFn(() => {
    animationFrameRef.current = undefined;

    const shouldUsePreload = shouldUsePreloadRef.current;
    shouldUsePreloadRef.current = false;
    syncWindowRef({ usePreload: shouldUsePreload });
  });

  const scheduleSyncWindow = useMemoizedFn(
    ({ usePreload = false }: { usePreload?: boolean } = {}) => {
      shouldUsePreloadRef.current = shouldUsePreloadRef.current || usePreload;

      if (animationFrameRef.current !== undefined || typeof window === 'undefined') return;

      animationFrameRef.current = window.requestAnimationFrame(flushSyncWindow);
    }
  );

  const schedulePreloadSyncWindow = useMemoizedFn(() => {
    scheduleSyncWindow({ usePreload: true });
  });

  const scheduleNormalSyncWindow = useMemoizedFn(() => {
    scheduleSyncWindow();
  });

  useEventListener('scroll', scheduleNormalSyncWindow, {
    target: listenToWindow ? undefined : containerRef,
    capture: listenToWindow,
    passive: true
  });
  useEventListener('resize', scheduleNormalSyncWindow, {
    passive: true
  });

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== undefined && typeof window !== 'undefined') {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    scheduleNormalSyncWindow,
    schedulePreloadSyncWindow
  };
};

/**
 * 计算虚拟列表上下占位高度，支持带固定间距的网格行和无间距的普通列表。
 */
export const getVirtualPlaceholderHeight = (itemCount: number, itemHeight: number, itemGap = 0) =>
  itemCount > 0 ? itemCount * itemHeight + (itemCount - 1) * itemGap : 0;

/**
 * 根据容器滚动位置计算虚拟列表窗口。
 * 使用上下占位块模拟未渲染内容，避免通过 effect 修改 wrapper 的 margin 和 height 导致滚动跳动。
 */
const useVirtualWindow = <T,>({
  data,
  containerRef,
  itemHeight,
  overscan
}: {
  data: T[];
  containerRef: RefObject<HTMLDivElement>;
  itemHeight: number;
  overscan: number;
}) => {
  const size = useSize(containerRef);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const rowHeight = Math.max(itemHeight, 1);

  const syncWindow = useMemoizedFn(() => {
    const container = containerRef.current;
    if (!container || data.length === 0) {
      setRange((state) => (state.start === 0 && state.end === 0 ? state : { start: 0, end: 0 }));
      return;
    }

    const visibleStart = Math.min(
      Math.floor(Math.max(container.scrollTop, 0) / rowHeight),
      data.length - 1
    );
    const visibleCount = Math.max(Math.ceil(container.clientHeight / rowHeight), 1);
    const start = Math.max(visibleStart - overscan, 0);
    const end = Math.min(data.length, visibleStart + visibleCount + overscan);

    setRange((state) => (state.start === start && state.end === end ? state : { start, end }));
  });

  useVirtualScrollWindow({
    containerRef,
    syncWindow
  });

  useBrowserLayoutEffect(() => {
    syncWindow();
  }, [data.length, itemHeight, overscan, size?.height, size?.width, syncWindow]);

  const list = useMemo<VirtualListItem<T>[]>(
    () =>
      data.slice(range.start, range.end).map((item, index) => ({
        data: item,
        index: range.start + index
      })),
    [data, range.end, range.start]
  );

  return {
    list,
    topPlaceholderHeight: getVirtualPlaceholderHeight(range.start, rowHeight),
    bottomPlaceholderHeight: getVirtualPlaceholderHeight(data.length - range.end, rowHeight)
  };
};

/**
 * 为已经一次性加载到内存的数据提供固定高度虚拟窗口。
 *
 * 与 `useVirtualList` 的分页版本分离：调用方仍持有完整数据，只把视口附近的项目交给 DOM
 * 渲染。适用于模型配置等数据量较大、但后端无需分页的管理列表。
 */
export const useStaticVirtualList = <T,>({
  data,
  itemHeight,
  overscan = defaultOverscan
}: {
  data: T[];
  itemHeight: number;
  overscan?: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { list, topPlaceholderHeight, bottomPlaceholderHeight } = useVirtualWindow({
    data,
    containerRef,
    itemHeight,
    overscan
  });

  const scrollToTop = useMemoizedFn(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  });

  return {
    containerRef,
    virtualDataList: list,
    topPlaceholderHeight,
    bottomPlaceholderHeight,
    scrollToTop
  };
};

/**
 * 提供固定滚动容器中的虚拟列表和 offset 分页加载。
 * 只渲染视口附近的数据，分页请求仍由 useScrollPagination 统一处理，支持搜索刷新和空状态。
 */
export function useVirtualList<
  TParams extends PaginationType,
  TData extends PaginationResponseType
>(
  api: (data: TParams) => Promise<TData>,
  {
    refreshDeps,
    itemHeight,
    overscan = defaultOverscan,
    pageSize = 10,
    params,
    EmptyTip,
    showErrorToast = true,
    disabled = false,
    showNoMoreTip = true
  }: UseVirtualListProps<TParams>
) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, total, setData, setTotal, isLoading, fetchData, refreshList } = useScrollPagination(
    api,
    {
      refreshDeps,
      pageSize,
      params,
      EmptyTip,
      showErrorToast,
      disabled,
      showNoMoreTip
    }
  );

  const noMore = data.length >= total;
  const isEmpty = total === 0 && !isLoading;
  const loadText = isLoading
    ? t('common:is_requesting')
    : noMore
      ? t('common:request_end')
      : t('common:request_more');
  const { list, topPlaceholderHeight, bottomPlaceholderHeight } = useVirtualWindow({
    data,
    containerRef,
    itemHeight,
    overscan
  });

  const scroll = useScroll(containerRef);

  // 虚拟列表不展示分页 loading 覆盖层，只在接近底部时触发下一页请求。
  useThrottleEffect(
    () => {
      const container = containerRef.current;
      if (!container || noMore || isLoading || data.length === 0) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop + clientHeight >= scrollHeight - loadMoreThreshold) {
        fetchData({ init: false, ScrollContainerRef: containerRef });
      }
    },
    [data.length, fetchData, isLoading, noMore, scroll],
    { wait: 50 }
  );

  // 数据量不足以撑满容器时主动继续分页，避免没有滚动条时无法触发下一页请求。
  useEffect(() => {
    const container = containerRef.current;
    if (
      !container ||
      data.length === 0 ||
      data.length >= total ||
      isLoading ||
      container.scrollHeight > container.clientHeight + loadMoreThreshold
    ) {
      return;
    }

    fetchData({ init: false, ScrollContainerRef: containerRef });
  }, [data.length, fetchData, isLoading, total]);

  const scroll2Top = useMemoizedFn(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  });

  const ScrollList = useMemoizedFn(({ children, ...props }: VirtualListProps) => (
    <Box ref={containerRef} minH={0} h={'100%'} overflow={'auto'} {...props}>
      <Box display={'flex'} flexDirection={'column'}>
        {topPlaceholderHeight > 0 && (
          <Box flexShrink={0} h={`${topPlaceholderHeight}px`} pointerEvents={'none'} />
        )}
        {children}
        {bottomPlaceholderHeight > 0 && (
          <Box flexShrink={0} h={`${bottomPlaceholderHeight}px`} pointerEvents={'none'} />
        )}
      </Box>
      {!isEmpty && (showNoMoreTip || !noMore) && (
        <Box
          mt={2}
          fontSize={'xs'}
          color={'blackAlpha.500'}
          textAlign={'center'}
          cursor={loadText === t('common:request_more') ? 'pointer' : 'default'}
          onClick={() => {
            if (loadText !== t('common:request_more')) return;
            fetchData({ init: false, ScrollContainerRef: containerRef });
          }}
        >
          {loadText}
        </Box>
      )}
      {isEmpty && EmptyTip}
    </Box>
  ));

  return {
    containerRef,
    scrollDataList: list,
    total,
    totalData: data,
    setData,
    setTotal,
    isLoading,
    ScrollList,
    fetchData,
    scroll2Top,
    refreshList
  };
}
