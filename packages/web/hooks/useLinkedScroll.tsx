import { useCallback, useEffect, useRef, useState } from 'react';
import throttle from 'lodash/throttle';

interface UseLinkedScrollOptions<T, P> {
  // 容器和项目引用
  containerRef: React.RefObject<HTMLElement>;
  itemRefs: React.RefObject<(HTMLElement | null)[]>;

  // 数据请求函数
  fetchInitialData: (id: string) => Promise<{
    list: T[];
    hasMorePrev: boolean;
    hasMoreNext: boolean;
  }>;
  fetchPrevData?: (anchorId: string) => Promise<{
    list: T[];
    hasMorePrev: boolean;
  }>;
  fetchNextData?: (anchorId: string) => Promise<{
    list: T[];
    hasMoreNext: boolean;
  }>;

  // 配置参数
  initialId?: string;
  threshold?: number;

  // 依赖与状态
  dependencies?: any[];
  canLoadData?: boolean;
  onError?: (error: any) => void;
}

const stabilizingTime = 1500;

export function useLinkedScroll<T extends Record<string, any>, P>({
  containerRef,
  itemRefs,
  fetchInitialData,
  fetchPrevData,
  fetchNextData,
  initialId,
  threshold = 100,
  dependencies = [],
  canLoadData = false,
  onError
}: UseLinkedScrollOptions<T, P>) {
  // 数据状态
  const [dataList, setDataList] = useState<T[]>([]);
  const [topAnchorId, setTopAnchorId] = useState<string | null>(null);
  const [bottomAnchorId, setBottomAnchorId] = useState<string | null>(null);
  const [hasMorePrev, setHasMorePrev] = useState(true);
  const [hasMoreNext, setHasMoreNext] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // 加载状态
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isPrevLoading, setIsPrevLoading] = useState(false);
  const [isNextLoading, setIsNextLoading] = useState(false);

  // 滚动控制
  const [isInitialStabilizing, setIsInitialStabilizing] = useState(false);
  const [suppressScroll, setSuppressScroll] = useState(false);
  const isUserScrollingRef = useRef(false);
  const scrollPositionRef = useRef({ top: 0, viewItem: '' });

  // 定时器引用
  const timerRefs = useRef<{
    stabilizing: NodeJS.Timeout | null;
    scrollSuppress: NodeJS.Timeout | null;
  }>({
    stabilizing: null,
    scrollSuppress: null
  });

  // 计算合并加载状态
  const isLoading = isInitialLoading || isPrevLoading || isNextLoading;

  // 保存当前滚动位置
  const saveScrollPosition = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const { scrollTop, clientHeight } = container;

    // 保存滚动位置
    scrollPositionRef.current.top = scrollTop;

    // 查找视图中心的元素
    const centerY = scrollTop + clientHeight / 2;
    let closestItem = null;
    let closestDistance = Infinity;

    itemRefs.current?.forEach((ref, index) => {
      if (ref) {
        const rect = ref.getBoundingClientRect();
        const itemCenterY = rect.top + rect.height / 2;
        const distance = Math.abs(itemCenterY - window.innerHeight / 2);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestItem = index;
        }
      }
    });

    if (closestItem !== null && dataList[closestItem]) {
      scrollPositionRef.current.viewItem = dataList[closestItem]._id;
    }
  }, [containerRef, itemRefs, dataList]);

  // 重置滚动状态
  const resetScrollState = useCallback(() => {
    isUserScrollingRef.current = false;
    setSuppressScroll(false);
  }, []);

  // 初始加载或刷新数据
  const loadData = useCallback(
    async (id: string) => {
      if (!id) return;

      try {
        setIsInitialLoading(true);
        setSuppressScroll(true);

        const response = await fetchInitialData(id);

        setHasMorePrev(response.hasMorePrev);
        setHasMoreNext(response.hasMoreNext);

        setDataList(response.list);
        if (response.list.length > 0) {
          setTopAnchorId(response.list[0]._id);
          setBottomAnchorId(response.list[response.list.length - 1]._id);
        }
        setInitialLoadDone(true);

        // 设置稳定期
        setIsInitialStabilizing(true);

        // 清除之前的定时器
        clearAllTimers();

        // 设置新的稳定期定时器
        timerRefs.current.stabilizing = setTimeout(() => {
          setIsInitialStabilizing(false);
        }, stabilizingTime);

        // 延迟恢复滚动
        timerRefs.current.scrollSuppress = setTimeout(() => {
          setSuppressScroll(false);
        }, 500);
      } catch (error) {
        onError?.(error);
        console.error('Error fetching initial data:', error);
      } finally {
        setIsInitialLoading(false);
      }
    },
    [fetchInitialData, stabilizingTime, onError]
  );

  // 加载上方数据
  const loadPrevData = useCallback(async () => {
    if (!topAnchorId || !hasMorePrev || isLoading || !fetchPrevData) return;

    try {
      isUserScrollingRef.current = true;
      saveScrollPosition();
      setIsPrevLoading(true);

      const prevHeight = containerRef?.current?.scrollHeight || 0;
      const prevScrollTop = containerRef?.current?.scrollTop || 0;

      const response = await fetchPrevData(topAnchorId);

      setHasMorePrev(response.hasMorePrev);

      if (response.list.length > 0) {
        setDataList((prev) => [...response.list, ...prev]);
        setTopAnchorId(response.list[0]._id);

        // 调整滚动位置
        requestAnimationFrame(() => {
          if (containerRef?.current) {
            const newHeight = containerRef.current.scrollHeight;
            const heightDiff = newHeight - prevHeight;
            containerRef.current.scrollTop = prevScrollTop + heightDiff;

            setTimeout(() => {
              isUserScrollingRef.current = false;
            }, 100);
          }
        });
      } else {
        isUserScrollingRef.current = false;
      }
    } catch (error) {
      onError?.(error);
      console.error('Error fetching previous data:', error);
      isUserScrollingRef.current = false;
    } finally {
      setIsPrevLoading(false);
    }
  }, [
    topAnchorId,
    hasMorePrev,
    isLoading,
    saveScrollPosition,
    fetchPrevData,
    containerRef,
    onError
  ]);

  // 加载下方数据
  const loadNextData = useCallback(async () => {
    if (!bottomAnchorId || !hasMoreNext || isLoading || !fetchNextData) return;

    try {
      isUserScrollingRef.current = true;
      saveScrollPosition();
      setIsNextLoading(true);

      const prevScrollTop = containerRef?.current?.scrollTop || 0;

      const response = await fetchNextData(bottomAnchorId);

      setHasMoreNext(response.hasMoreNext);

      if (response.list.length > 0) {
        setDataList((prev) => [...prev, ...response.list]);
        setBottomAnchorId(response.list[response.list.length - 1]._id);

        requestAnimationFrame(() => {
          if (containerRef?.current) {
            containerRef.current.scrollTop = prevScrollTop;

            setTimeout(() => {
              isUserScrollingRef.current = false;
            }, 100);
          }
        });
      } else {
        isUserScrollingRef.current = false;
      }
    } catch (error) {
      onError?.(error);
      console.error('Error fetching next data:', error);
      isUserScrollingRef.current = false;
    } finally {
      setIsNextLoading(false);
    }
  }, [
    bottomAnchorId,
    hasMoreNext,
    isLoading,
    saveScrollPosition,
    fetchNextData,
    containerRef,
    onError
  ]);

  // 导航到特定项目
  const navigateToItem = useCallback(
    (id: string) => {
      if (suppressScroll || isUserScrollingRef.current) return;

      const itemIndex = dataList.findIndex((item) => item._id === id);

      if (itemIndex !== -1 && itemRefs.current?.[itemIndex]) {
        itemRefs.current[itemIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        loadData(id);
      }
    },
    [dataList, itemRefs, loadData, suppressScroll]
  );

  // 初始加载
  useEffect(() => {
    console.log('初始加载', initialId, !initialLoadDone, canLoadData);
    if (initialId && !initialLoadDone && canLoadData) {
      loadData(initialId);
    }
  }, [canLoadData, ...dependencies]);

  // 滚动监听
  useEffect(() => {
    if (!containerRef.current || !initialLoadDone) return;

    const handleScroll = throttle(() => {
      if (!containerRef.current || isLoading || isInitialStabilizing || suppressScroll) return;

      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

      // 记录用户正在滚动
      isUserScrollingRef.current = true;

      // 滚动到底部附近，加载更多下方数据
      if (scrollTop + clientHeight >= scrollHeight - threshold && hasMoreNext) {
        loadNextData();
      }

      // 滚动到顶部附近，加载更多上方数据
      if (scrollTop <= threshold && hasMorePrev) {
        loadPrevData();
      }
    }, 200);

    const container = containerRef.current;
    container.addEventListener('scroll', handleScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      handleScroll.cancel && handleScroll.cancel();
    };
  }, [
    containerRef,
    initialLoadDone,
    isLoading,
    isInitialStabilizing,
    suppressScroll,
    hasMoreNext,
    hasMorePrev,
    loadNextData,
    loadPrevData,
    threshold
  ]);

  // 清理所有定时器
  const clearAllTimers = useCallback(() => {
    Object.entries(timerRefs.current).forEach(([_, timer]) => {
      if (timer) clearTimeout(timer);
    });
    timerRefs.current.stabilizing = null;
    timerRefs.current.scrollSuppress = null;
  }, []);

  const resetLoadState = useCallback(() => {
    // 重置数据状态
    setDataList([]);
    setTopAnchorId(null);
    setBottomAnchorId(null);
    setHasMorePrev(true);
    setHasMoreNext(true);
    setInitialLoadDone(false);

    // 重置加载状态
    setIsInitialLoading(false);
    setIsPrevLoading(false);
    setIsNextLoading(false);

    // 重置滚动控制状态
    setIsInitialStabilizing(false);
    setSuppressScroll(false);
    isUserScrollingRef.current = false;
    scrollPositionRef.current = { top: 0, viewItem: '' };
  }, [clearAllTimers]);

  // 组件卸载时清除所有定时器
  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);

  return {
    dataList,
    isLoading,
    isInitialLoading,
    isPrevLoading,
    isNextLoading,
    hasMorePrev,
    hasMoreNext,
    initialLoadDone,
    suppressScroll,
    loadData,
    navigateToItem,
    resetScrollState,
    resetLoadState
  };
}
