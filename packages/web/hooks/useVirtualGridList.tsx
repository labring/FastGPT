import { Box } from '@chakra-ui/react';
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

type UseVirtualGridListParams<T> = {
  list: T[];
  /** 列表上下文变化时用于重置虚拟窗口，例如目录、搜索词或 tab 变化。 */
  listKey: string;
  /** Grid 中不属于 list 的固定卡片数量，例如“新建”入口。 */
  reservedSlotCount?: number;
  /** 每次加载的行数批次 */
  batchRows?: number;
  /** 默认列数 */
  defaultColumnCount?: number;
  /** 预估行高 */
  estimatedRowHeight?: number;
  /** 预估行间距 */
  estimatedRowGap?: number;
  /** IntersectionObserver 预加载边距 */
  preloadRootMargin?: string;
  /** 视口外额外渲染的行数（上下各一半） */
  overscanRows?: number;
  /** 最大同时渲染行数，防止内存溢出 */
  maxRenderRows?: number;
};

type UseVirtualGridListReturn<T> = {
  gridRef: RefObject<HTMLDivElement>;
  renderVirtualGridItems: (renderItem: VirtualGridItemRenderer<T>) => ReactNode;
};

type VirtualGridItemRenderer<T> = (item: T) => ReactNode;

type VirtualGridItemsState<T> = {
  leadingList: T[];
  visibleList: T[];
  hasMore: boolean;
  topPlaceholderHeight: number;
  bottomPlaceholderHeight: number;
  loadMoreRef: RefObject<HTMLDivElement>;
};

type VirtualGridItemsProps<T> = VirtualGridItemsState<T> & {
  renderItem: VirtualGridItemRenderer<T>;
};

const defaultBatchRows = 15;
const defaultGridColumnCount = 1;
const defaultEstimatedRowHeight = 160;
const defaultEstimatedRowGap = 20;
const defaultPreloadRootMargin = '0px 0px 800px 0px';
const defaultOverscanRows = 6;

/**
 * 计算占位符高度
 * @param rowCount 行数
 * @param rowHeight 行高
 * @param rowGap 行间距
 */
const getPlaceholderHeight = (rowCount: number, rowHeight: number, rowGap: number) =>
  rowCount > 0 ? rowCount * rowHeight + (rowCount - 1) * rowGap : 0;

/**
 * 解析 rootMargin 字符串，提取底部预加载距离
 * IntersectionObserver 的 rootMargin 兼容 CSS 简写，这里只需要底部预加载距离。
 * @param rootMargin CSS margin 字符串
 */
const getRootMarginBottom = (rootMargin: string) => {
  const parts = rootMargin.trim().split(/\s+/);
  // CSS margin 简写规则：1值(全), 2值(上下/左右), 3值(上/左右/下), 4值(上/右/下/左)
  const bottom = parts.length === 3 || parts.length === 4 ? parts[2] : parts[0];
  const value = Number.parseFloat(bottom);

  return Number.isNaN(value) ? 0 : value;
};

/**
 * 虚拟网格列表渲染组件
 * 负责渲染固定项、可见项以及用于撑开滚动高度的占位符
 */
const VirtualGridItems = <T,>({
  leadingList,
  visibleList,
  renderItem,
  hasMore,
  topPlaceholderHeight,
  bottomPlaceholderHeight,
  loadMoreRef
}: VirtualGridItemsProps<T>) => {
  return (
    <>
      {/* 渲染首行固定项（如新建按钮等） */}
      {leadingList.map(renderItem)}
      {/* 顶部占位符，模拟已滚动过的内容高度 */}
      {topPlaceholderHeight > 0 && (
        <Box gridColumn={'1 / -1'} h={`${topPlaceholderHeight}px`} pointerEvents={'none'} />
      )}
      {/* 渲染当前视口内的可见项 */}
      {visibleList.map(renderItem)}
      {/* 底部占位符及加载更多触发器 */}
      {hasMore && (
        <Box
          gridColumn={'1 / -1'}
          h={`${Math.max(bottomPlaceholderHeight, 1)}px`}
          position={'relative'}
        >
          {/* 用于 IntersectionObserver 监听的触发元素 */}
          <Box ref={loadMoreRef} position={'absolute'} top={0} left={0} right={0} h={'1px'} />
        </Box>
      )}
    </>
  );
};

/**
 * 为响应式 Grid 列表提供本地虚拟分页能力。
 *
 * Hook 会保留首行固定项，并只渲染视口附近的数据窗口，通过顶部/底部占位维持
 * 接近完整列表的滚动高度。创建卡片等固定 Grid 项可通过 reservedSlotCount
 * 计入首行布局，但不会出现在返回的数据列表中。
 */
export function useVirtualGridList<T>({
  list,
  listKey,
  reservedSlotCount = 0,
  batchRows = defaultBatchRows,
  defaultColumnCount = defaultGridColumnCount,
  estimatedRowHeight = defaultEstimatedRowHeight,
  estimatedRowGap = defaultEstimatedRowGap,
  preloadRootMargin = defaultPreloadRootMargin,
  overscanRows = defaultOverscanRows,
  maxRenderRows
}: UseVirtualGridListParams<T>): UseVirtualGridListReturn<T> {
  const gridRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  /** requestAnimationFrame ID，用于防抖同步窗口 */
  const syncWindowFrameRef = useRef<number>();
  /** 标记下次同步是否需要使用预加载边距 */
  const shouldUsePreloadRef = useRef(false);
  const [gridColumnCount, setGridColumnCount] = useState(defaultColumnCount);
  const [rowHeight, setRowHeight] = useState(estimatedRowHeight);
  const [rowGap, setRowGap] = useState(estimatedRowGap);
  const [windowRowsState, setWindowRowsState] = useState({
    key: listKey,
    startRow: 0,
    endRow: batchRows
  });
  // 计算最大渲染行数，至少为 batchRows，默认不超过 batchRows * 2 或 30
  const resolvedMaxRenderRows = Math.max(maxRenderRows ?? Math.max(batchRows * 2, 30), batchRows);

  /**
   * 更新网格度量信息（列数、行高、行间距）
   * 通过读取 DOM 样式和实际元素尺寸来动态适配响应式布局
   */
  const updateGridMetrics = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const gridStyle = getComputedStyle(grid);
    const gridTemplateColumns = gridStyle.gridTemplateColumns;
    // 计算当前实际列数
    const columnCount =
      gridTemplateColumns && gridTemplateColumns !== 'none'
        ? gridTemplateColumns.split(' ').filter(Boolean).length
        : defaultColumnCount;

    setGridColumnCount((prev) => (prev === columnCount ? prev : columnCount));

    // 获取行间距
    const nextRowGap = Number.parseFloat(gridStyle.rowGap);
    if (!Number.isNaN(nextRowGap)) {
      setRowGap((prev) => (prev === nextRowGap ? prev : nextRowGap));
    }

    // 通过第一个带有 data-virtual-item 标记的元素测量实际行高
    const measuredNode = grid.querySelector('[data-virtual-item]');
    if (measuredNode instanceof HTMLElement) {
      const nextRowHeight = measuredNode.getBoundingClientRect().height;
      if (nextRowHeight > 0) {
        setRowHeight((prev) => (prev === nextRowHeight ? prev : nextRowHeight));
      }
    }
  }, [defaultColumnCount]);

  // 监听网格尺寸变化和窗口 resize，更新度量信息
  useEffect(() => {
    updateGridMetrics();

    const grid = gridRef.current;
    if (!grid) return;

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            updateGridMetrics();
          });

    resizeObserver?.observe(grid);
    window.addEventListener('resize', updateGridMetrics);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateGridMetrics);
    };
  }, [list.length, updateGridMetrics]);

  // 计算总槽位数（数据项 + 固定项）
  const totalSlotCount = list.length + reservedSlotCount;
  // 计算总行数
  const totalRows = Math.ceil(totalSlotCount / gridColumnCount);

  /**
   * 计算首行需要常驻渲染的数据项数量
   * 当固定卡片占用首行部分位置时，需要补齐同一行的剩余数据项，避免滚动占位错位
   */
  const leadingItemCount = useMemo(() => {
    const remainingSlotCount = reservedSlotCount % gridColumnCount;

    if (remainingSlotCount === 0) {
      return 0;
    }

    return Math.min(list.length, gridColumnCount - remainingSlotCount);
  }, [gridColumnCount, list.length, reservedSlotCount]);

  // 固定区域占用的行数
  const fixedRowCount = Math.ceil((reservedSlotCount + leadingItemCount) / gridColumnCount);
  // 虚拟滚动区域的总行数（扣除固定行）
  const totalVirtualRows = Math.max(totalRows - fixedRowCount, 0);
  // 每行占据的垂直空间（行高 + 间距）
  const rowFullHeight = Math.max(rowHeight + rowGap, 1);
  // 视口换算成虚拟行号时，需要扣掉固定区域已占用的高度
  const fixedSectionOffset = fixedRowCount * rowFullHeight;
  // 底部预加载边距像素值
  const preloadBottomMargin = getRootMarginBottom(preloadRootMargin);

  /**
   * 同步可视窗口行范围
   * 根据当前滚动位置和视口大小，计算需要渲染的起始行和结束行
   * @param usePreload 是否启用预加载边距（用于 IntersectionObserver 触发时提前加载）
   */
  const syncWindowRows = useCallback(
    ({ usePreload = false }: { usePreload?: boolean } = {}) => {
      const grid = gridRef.current;
      if (!grid) return;

      // 如果没有虚拟行，重置状态
      if (totalVirtualRows === 0) {
        setWindowRowsState((state) => {
          if (state.key === listKey && state.startRow === 0 && state.endRow === 0) {
            return state;
          }

          return {
            key: listKey,
            startRow: 0,
            endRow: 0
          };
        });
        return;
      }

      const rect = grid.getBoundingClientRect();
      // 计算虚拟视口相对于固定区域顶部的偏移量
      const virtualViewportTop = Math.max(-rect.top - fixedSectionOffset, 0);
      const virtualViewportBottom = Math.max(
        window.innerHeight - rect.top - fixedSectionOffset + (usePreload ? preloadBottomMargin : 0),
        0
      );

      // 计算可见区域的起始行和结束行
      const visibleStartRow = Math.min(
        Math.floor(virtualViewportTop / rowFullHeight),
        totalVirtualRows
      );
      const visibleEndRow = Math.min(
        Math.ceil(virtualViewportBottom / rowFullHeight),
        totalVirtualRows
      );

      // 视口内可见行数
      const viewportRowCount = Math.max(visibleEndRow - visibleStartRow, 1);
      // 目标渲染行数（可见行数 + overscan，但不超过总行数）
      const targetRenderRows = Math.min(
        totalVirtualRows,
        Math.max(batchRows, viewportRowCount + overscanRows * 2)
      );

      // 初步计算渲染范围（包含 overscan）
      let nextStartRow = Math.max(visibleStartRow - overscanRows, 0);
      let nextEndRow = Math.min(
        Math.max(visibleEndRow + overscanRows, nextStartRow + batchRows),
        totalVirtualRows
      );

      // 如果当前范围小于目标渲染行数，尝试扩展范围
      const missingRows = targetRenderRows - (nextEndRow - nextStartRow);
      if (missingRows > 0) {
        const appendRows = Math.min(missingRows, totalVirtualRows - nextEndRow);
        nextEndRow += appendRows;
        nextStartRow = Math.max(nextStartRow - (missingRows - appendRows), 0);
      }

      // 如果渲染范围超过最大限制，以视口为中心进行裁剪
      if (nextEndRow - nextStartRow > resolvedMaxRenderRows) {
        const centeredStartRow = Math.max(
          Math.min(
            visibleStartRow - Math.floor((resolvedMaxRenderRows - viewportRowCount) / 2),
            totalVirtualRows - resolvedMaxRenderRows
          ),
          0
        );

        nextStartRow = centeredStartRow;
        nextEndRow = Math.min(centeredStartRow + resolvedMaxRenderRows, totalVirtualRows);
      }

      // 更新状态，仅在值变化时触发重渲染
      setWindowRowsState((state) => {
        if (
          state.key === listKey &&
          state.startRow === nextStartRow &&
          state.endRow === nextEndRow
        ) {
          return state;
        }

        return {
          key: listKey,
          startRow: nextStartRow,
          endRow: nextEndRow
        };
      });
    },
    [
      batchRows,
      fixedSectionOffset,
      listKey,
      overscanRows,
      preloadBottomMargin,
      resolvedMaxRenderRows,
      rowFullHeight,
      totalVirtualRows
    ]
  );

  /**
   * 立即执行窗口同步，清除 pending 的 frame
   */
  const flushSyncWindowRows = useCallback(() => {
    syncWindowFrameRef.current = undefined;

    const shouldUsePreload = shouldUsePreloadRef.current;
    shouldUsePreloadRef.current = false;

    syncWindowRows({
      usePreload: shouldUsePreload
    });
  }, [syncWindowRows]);

  /**
   * 调度窗口同步，使用 requestAnimationFrame 防抖
   * @param usePreload 是否启用预加载
   */
  const scheduleSyncWindowRows = useCallback(
    ({ usePreload = false }: { usePreload?: boolean } = {}) => {
      shouldUsePreloadRef.current = shouldUsePreloadRef.current || usePreload;

      // 如果已有 pending 的 frame，不再重复调度
      if (syncWindowFrameRef.current !== undefined) {
        return;
      }

      syncWindowFrameRef.current = window.requestAnimationFrame(flushSyncWindowRows);
    },
    [flushSyncWindowRows]
  );

  /** 调度带预加载的窗口同步 */
  const schedulePreloadSyncWindowRows = useCallback(() => {
    scheduleSyncWindowRows({
      usePreload: true
    });
  }, [scheduleSyncWindowRows]);

  /** 调度普通窗口同步 */
  const scheduleNormalSyncWindowRows = useCallback(() => {
    scheduleSyncWindowRows();
  }, [scheduleSyncWindowRows]);

  // 当列表关键数据变化时，立即同步一次窗口
  useEffect(() => {
    updateGridMetrics();
    schedulePreloadSyncWindowRows();
  }, [leadingItemCount, list.length, listKey, schedulePreloadSyncWindowRows, updateGridMetrics]);

  // 监听全局 scroll 和 resize 事件，调度窗口同步
  useEffect(() => {
    window.addEventListener('scroll', scheduleNormalSyncWindowRows, {
      capture: true,
      passive: true
    });
    window.addEventListener('resize', scheduleNormalSyncWindowRows, {
      passive: true
    });

    return () => {
      window.removeEventListener('scroll', scheduleNormalSyncWindowRows, {
        capture: true
      });
      window.removeEventListener('resize', scheduleNormalSyncWindowRows);
    };
  }, [scheduleNormalSyncWindowRows]);

  // 组件卸载时取消 pending 的 animation frame
  useEffect(() => {
    return () => {
      if (syncWindowFrameRef.current !== undefined) {
        window.cancelAnimationFrame(syncWindowFrameRef.current);
      }
    };
  }, []);

  // 获取当前有效的窗口行状态，如果 key 不匹配则重置
  const activeWindowRows =
    windowRowsState.key === listKey
      ? windowRowsState
      : {
          key: listKey,
          startRow: 0,
          endRow: batchRows
        };

  // 确保行范围在合法区间内
  const startRow = Math.min(activeWindowRows.startRow, totalVirtualRows);
  const endRow = Math.min(Math.max(activeWindowRows.endRow, startRow), totalVirtualRows);

  // 计算可见项在原始 list 中的索引范围
  const visibleStartIndex = leadingItemCount + startRow * gridColumnCount;
  const visibleEndIndex = Math.min(leadingItemCount + endRow * gridColumnCount, list.length);

  // 首行固定项列表
  const leadingList = useMemo(() => list.slice(0, leadingItemCount), [leadingItemCount, list]);
  // 当前可见项列表
  const visibleList = useMemo(
    () => list.slice(visibleStartIndex, visibleEndIndex),
    [list, visibleEndIndex, visibleStartIndex]
  );

  // 是否还有更多数据未渲染
  const hasMore = endRow < totalVirtualRows;

  // 计算顶部和底部占位符高度
  const topPlaceholderHeight = getPlaceholderHeight(startRow, rowHeight, rowGap);
  const bottomPlaceholderHeight = getPlaceholderHeight(
    Math.max(totalVirtualRows - endRow, 0),
    rowHeight,
    rowGap
  );

  // 聚合虚拟网格状态
  const virtualGridItemsState = useMemo<VirtualGridItemsState<T>>(
    () => ({
      leadingList,
      visibleList,
      hasMore,
      topPlaceholderHeight,
      bottomPlaceholderHeight,
      loadMoreRef
    }),
    [bottomPlaceholderHeight, hasMore, leadingList, topPlaceholderHeight, visibleList]
  );

  // 渲染函数，接收 renderItem 回调
  const renderVirtualGridItems = useCallback(
    (renderItem: VirtualGridItemRenderer<T>) => (
      <VirtualGridItems {...virtualGridItemsState} renderItem={renderItem} />
    ),
    [virtualGridItemsState]
  );

  // 使用 IntersectionObserver 监听底部触发器，实现预加载
  useEffect(() => {
    if (!hasMore) return;

    const target = loadMoreRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          schedulePreloadSyncWindowRows();
        }
      },
      {
        rootMargin: preloadRootMargin,
        threshold: 0.1
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, preloadRootMargin, schedulePreloadSyncWindowRows, visibleList.length]);

  return {
    gridRef,
    renderVirtualGridItems
  };
}
