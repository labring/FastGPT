import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 根据视口宽度动态估算每次加载的最优数量（列数 × 8 行）。
 * 确保首屏不留白，同时减少触底后的连续加载次数。
 *
 * @example
 * const pageSize = calcInfiniteScrollPageSize();
 * // 视口 < 768px  → 2列×8 = 16
 * // 视口 < 1280px → 3列×8 = 24
 * // 视口 ≥ 1280px → 4列×8 = 32
 */
export function calcInfiniteScrollPageSize(): number {
  if (typeof window === 'undefined') return 32;
  const cols = window.innerWidth >= 1280 ? 4 : window.innerWidth >= 768 ? 3 : 2;
  return cols * 8;
}

type UseInfiniteScrollOptions = {
  /** 每页数量。不传时调用 calcInfiniteScrollPageSize() 自动计算 */
  pageSize?: number;
  /**
   * IntersectionObserver rootMargin。
   * 默认 '0px 0px 200px 0px'，即距视口底部 200px 时提前触发，实现预加载。
   */
  rootMargin?: string;
};

type UseInfiniteScrollReturn<T> = {
  /** 所有已加载页的累积数据 */
  list: T[];
  /** 是否正在加载（初始加载和加载更多均为 true） */
  isLoading: boolean;
  /** 是否还有更多数据（可用于在底部显示 loading 指示器） */
  hasMore: boolean;
  /** 重置到第 1 页并重新加载（适用于删除/更新等操作后的刷新） */
  refresh: () => Promise<void>;
  /**
   * 挂载到哨兵 DOM 元素的 callback ref。
   * 当哨兵元素进入视口时，hook 内部自动触发加载下一页。
   *
   * @example
   * // 在 JSX 末尾放置哨兵元素：
   * <Box ref={sentinelCallbackRef} h="1px" aria-hidden />
   */
  sentinelCallbackRef: (el: HTMLDivElement | null) => void;
};

/**
 * 无限滚动分页 Hook（基于 IntersectionObserver）
 *
 * 核心特性：
 * - fetcher 引用变化时自动重置列表并重新加载（通过 useCallback deps 驱动）
 * - callback ref 方案解决了 useRef 不触发 Effect 导致 Observer 失绑的问题
 * - hasMore 基于"最后一页返回数量"而非单纯依赖 total 计数，兼容权限过滤场景
 *
 * @param fetcher 稳定的数据获取函数（推荐用 useCallback 包裹，deps 为过滤参数）。
 *   当 fetcher 引用变化时，hook 自动 reset + 重新加载第 1 页。
 * @param options 可选配置
 *
 * @example
 * const fetcher = useCallback(
 *   (params) => getMyListPaginated({ ...params, keyword }),
 *   [keyword]
 * );
 *
 * const { list, isLoading, hasMore, refresh, sentinelCallbackRef } =
 *   useInfiniteScroll(fetcher);
 *
 * // JSX：
 * // {list.map(item => <Card key={item.id} item={item} />)}
 * // {(hasMore || isLoading) && <Spinner />}
 * // <Box ref={sentinelCallbackRef} h="1px" aria-hidden />
 */
export function useInfiniteScroll<T>(
  fetcher: (params: { pageNum: number; pageSize: number }) => Promise<{ list: T[]; total: number }>,
  options: UseInfiniteScrollOptions = {}
): UseInfiniteScrollReturn<T> {
  const { rootMargin = '0px 0px 200px 0px' } = options;

  // pageSize 只在挂载时计算一次，避免 resize 导致分页混乱
  const pageSizeRef = useRef(options.pageSize ?? calcInfiniteScrollPageSize());
  const pageSize = pageSizeRef.current;

  const [list, setList] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  /** 当前已加载到的最大页码 */
  const pageNumRef = useRef(0);
  /** 同步防并发守卫（非 state，不触发重渲染） */
  const fetchingRef = useRef(false);
  /** 同步 hasMore 最新值供 loadMore 闭包读取，避免闭包陈旧 */
  const hasMoreRef = useRef(false);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  /** 核心加载函数：pageNum===1 时替换列表，否则追加 */
  const fetchPage = useCallback(
    async (pageNum: number) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      setIsLoading(true);
      try {
        const res = await fetcher({ pageNum, pageSize });
        setList((prev) => (pageNum === 1 ? res.list : [...prev, ...res.list]));
        pageNumRef.current = pageNum;
        // 当本次有数据且服务端仍有更多页时，标记 hasMore=true
        setHasMore(res.list.length > 0 && pageNum * pageSize < res.total);
      } finally {
        fetchingRef.current = false;
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetcher] // pageSize 稳定，无需列入 deps
  );

  /** fetcher 引用变化（过滤条件变化）时：重置 → 加载第 1 页 */
  useEffect(() => {
    // 关键修复：重置并发守卫，避免新请求被静默丢弃
    // 场景：用户快速切换关键词时，旧请求进行中，fetcher 变化触发此 effect
    // 若不重置，fetchPage(1) 会因 fetchingRef.current=true 被直接 return
    fetchingRef.current = false;

    setList([]);
    setHasMore(false);
    pageNumRef.current = 0;
    fetchPage(1);
  }, [fetchPage]);

  /** 对外暴露的刷新入口（例如删除/更新操作后调用） */
  const refresh = useCallback(() => fetchPage(1), [fetchPage]);

  /** 内部加载下一页（由 Observer 调用，不对外暴露） */
  const loadMore = useCallback(() => {
    if (!hasMoreRef.current) return;
    fetchPage(pageNumRef.current + 1);
  }, [fetchPage]);

  // ---- Intersection Observer ----
  // 使用 useState 持有哨兵 DOM 元素，而非 useRef。
  // 原因：当父组件从 return null 恢复渲染后，哨兵重新挂载并调用 setSentinelEl(el)，
  //   触发下方 Effect 重新绑定 Observer，避免 Observer 失效的 Bug。
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const sentinelCallbackRef = useCallback((el: HTMLDivElement | null) => {
    setSentinelEl(el);
  }, []);

  useEffect(() => {
    if (!sentinelEl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin, threshold: 0 }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl, loadMore, rootMargin]);

  return { list, isLoading, hasMore, refresh, sentinelCallbackRef };
}
