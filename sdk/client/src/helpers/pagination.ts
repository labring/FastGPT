import { FastGptError } from '../core/errors';
import type { RequestOptions } from '../core/types';

export type AutoPagingOptions = RequestOptions & {
  /** 每页拉取条数（覆盖请求参数中的 pageSize，默认 20） */
  pageSize?: number;
  /** 最多拉取的条目总数上限（到达后立即停止后续翻页） */
  maxItems?: number;
  /** 最多拉取的页数上限（到达后立即停止后续翻页） */
  maxPages?: number;
};

export type CursorAutoPagingOptions = RequestOptions & {
  /** 最多拉取的条目总数上限（到达后立即停止后续翻页） */
  maxItems?: number;
  /** 最多拉取的页数上限（到达后立即停止后续翻页） */
  maxPages?: number;
};

export type PageSlice<TItem> = {
  list: TItem[];
  total?: number;
  /** 服务端实际生效的每页条数（可选，提供时用于精确计算页码模式偏移） */
  pageSize?: number;
  /** 服务端显式返回的续页标志（可选，提供时优先用于判断终止） */
  hasMore?: boolean;
};

export type CursorPageSlice<TItem, TCursor> = {
  list: TItem[];
  /** 下一页游标；省略或为 null 表示已到末页 */
  nextCursor?: TCursor | null;
};

/**
 * 统一异步分页迭代器：
 * - `for await (const item of pager)`：逐条流式遍历；
 * - `for await (const page of pager.pages())`：按页批量遍历；
 * - `await pager.toArray()`：一次收集全部条目（建议配合 maxItems 控制内存上限）。
 */
export type AsyncPageIterable<TItem> = AsyncIterable<TItem> & {
  pages: () => AsyncIterable<TItem[]>;
  toArray: () => Promise<TItem[]>;
};

const DEFAULT_PAGE_SIZE = 20;
// 对齐服务端 PaginationPageSizeLimit = 500；同时在运行期兼容更严格的子接口上限。
const MAX_SERVER_PAGE_SIZE = 500;

const isFiniteTotal = (total: number | undefined): total is number =>
  typeof total === 'number' && Number.isFinite(total) && total >= 0;

const isPositivePageSize = (size: number | undefined): size is number =>
  typeof size === 'number' && Number.isFinite(size) && size >= 1;

const buildAsyncPageIterable = <TItem>(
  createPageGenerator: () => AsyncGenerator<TItem[], void, undefined>
): AsyncPageIterable<TItem> => {
  const pages = (): AsyncIterable<TItem[]> => ({
    [Symbol.asyncIterator]: () => createPageGenerator()
  });

  const itemIterable: AsyncPageIterable<TItem> = {
    pages,
    async *[Symbol.asyncIterator](): AsyncIterator<TItem> {
      for await (const page of pages()) {
        for (const item of page) {
          yield item;
        }
      }
    },
    async toArray(): Promise<TItem[]> {
      const results: TItem[] = [];
      for await (const page of pages()) {
        results.push(...page);
      }
      return results;
    }
  };

  return itemIterable;
};

/**
 * 基于 `offset + pageSize` 协议的通用自动分页迭代器，覆盖 FastGPT 全量标准分页接口。
 */
export const createOffsetPaginator = <TItem>({
  fetchPage,
  initialOffset = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  maxItems,
  maxPages,
  signal
}: {
  fetchPage: (cursor: { offset: number; pageSize: number }) => Promise<PageSlice<TItem>>;
  initialOffset?: number;
  pageSize?: number;
  maxItems?: number;
  maxPages?: number;
  signal?: AbortSignal;
}): AsyncPageIterable<TItem> => {
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), MAX_SERVER_PAGE_SIZE);
  const safeInitialOffset = Math.max(0, Math.floor(initialOffset));

  return buildAsyncPageIterable<TItem>(async function* () {
    let offset = safeInitialOffset;
    let yieldedCount = 0;
    let pageCount = 0;

    while (true) {
      if (signal?.aborted) {
        throw new FastGptError({
          message: 'Auto-pagination was aborted',
          cause: signal.reason
        });
      }
      if (maxPages !== undefined && pageCount >= maxPages) {
        return;
      }
      if (maxItems !== undefined && yieldedCount >= maxItems) {
        return;
      }

      const remainingAllowance =
        maxItems !== undefined ? Math.min(safePageSize, maxItems - yieldedCount) : safePageSize;
      const requestedPageSize = Math.max(1, remainingAllowance);
      const page = await fetchPage({
        offset,
        pageSize: requestedPageSize
      });

      const items = page.list;
      if (items.length === 0) {
        return;
      }

      const sliced =
        maxItems !== undefined && yieldedCount + items.length > maxItems
          ? items.slice(0, maxItems - yieldedCount)
          : items;

      yieldedCount += sliced.length;
      offset += items.length;
      pageCount += 1;

      yield sliced;

      if (maxItems !== undefined && yieldedCount >= maxItems) {
        return;
      }
      if (page.hasMore === false) {
        return;
      }
      if (isFiniteTotal(page.total)) {
        // 服务端存在 total 时以实际偏移量与 total 为准，避免服务端把 pageSize 截断到上限（如 500 或更低）时误判为末页。
        if (offset >= page.total) {
          return;
        }
        continue;
      }
      if (page.hasMore === true) {
        continue;
      }
      const effectiveSize = isPositivePageSize(page.pageSize)
        ? Math.floor(page.pageSize)
        : requestedPageSize;
      if (items.length < effectiveSize) {
        return;
      }
    }
  });
};

/**
 * 基于 `pageNum + pageSize` 协议（从 1 开始）的通用自动分页迭代器。
 *
 * 寻址不变量：整个迭代过程始终向服务端发送相同的 `pageSize` 寻址基线，绝不根据短页/尾页返回条数反推改写
 * `pageSize`（防止 `initialPageNum > 1` 命中尾页时改变页码坐标系导致回读重复数据）。
 * - 响应提供 `hasMore` 时优先遵守 `hasMore`；
 * - 响应提供服务端实际 `pageSize` 与 `total` 时按 `(pageNum - 1) * serverPageSize + items.length >= total` 精确终止；
 * - 缺少上述元数据时：`initialPageNum === 1` 按累计读取条数与 `total` 判断终止；`initialPageNum > 1` 仅在满页可直接确认越过 `total` 时立即终止，
 *   遇短页且仍有不确定性时维持原 `pageSize` 探测下一页，收到空页后自然结束。
 */
export const createPageNumPaginator = <TItem>({
  fetchPage,
  initialPageNum = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  maxItems,
  maxPages,
  signal
}: {
  fetchPage: (cursor: { pageNum: number; pageSize: number }) => Promise<PageSlice<TItem>>;
  initialPageNum?: number;
  pageSize?: number;
  maxItems?: number;
  maxPages?: number;
  signal?: AbortSignal;
}): AsyncPageIterable<TItem> => {
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), MAX_SERVER_PAGE_SIZE);
  const safeInitialPageNum = Math.max(1, Math.floor(initialPageNum));

  return buildAsyncPageIterable<TItem>(async function* () {
    let pageNum = safeInitialPageNum;
    let loadedFromStart = 0;
    let yieldedCount = 0;
    let pageCount = 0;

    while (true) {
      if (signal?.aborted) {
        throw new FastGptError({
          message: 'Auto-pagination was aborted',
          cause: signal.reason
        });
      }
      if (maxPages !== undefined && pageCount >= maxPages) {
        return;
      }
      if (maxItems !== undefined && yieldedCount >= maxItems) {
        return;
      }

      const currentPageNum = pageNum;
      const page = await fetchPage({
        pageNum: currentPageNum,
        pageSize: safePageSize
      });

      const items = page.list;
      if (items.length === 0) {
        return;
      }

      const sliced =
        maxItems !== undefined && yieldedCount + items.length > maxItems
          ? items.slice(0, maxItems - yieldedCount)
          : items;

      yieldedCount += sliced.length;
      loadedFromStart += items.length;
      pageNum += 1;
      pageCount += 1;

      yield sliced;

      if (maxItems !== undefined && yieldedCount >= maxItems) {
        return;
      }
      if (page.hasMore === false) {
        return;
      }
      if (page.hasMore === true) {
        continue;
      }

      const serverPageSize = isPositivePageSize(page.pageSize)
        ? Math.floor(page.pageSize)
        : undefined;

      if (isFiniteTotal(page.total)) {
        if (serverPageSize !== undefined) {
          const endOffset = (currentPageNum - 1) * serverPageSize + items.length;
          if (endOffset >= page.total) {
            return;
          }
          continue;
        }
        if (safeInitialPageNum === 1) {
          // 从第 1 页连续遍历时累计条数即精确末尾偏移，不受服务端对 pageSize 的截断影响。
          if (loadedFromStart >= page.total) {
            return;
          }
          continue;
        }
        // 从第 N 页（N > 1）起始且响应未给出服务端实际 pageSize：
        // - 若返回满页（items.length >= safePageSize），可确认服务端未截断，精确计算末尾偏移；
        // - 若返回短页，不能区分“真实尾页”与“服务端截断页”，保持同一 safePageSize 探测下一页直到返回空页。
        if (items.length >= safePageSize) {
          const endOffset = (currentPageNum - 1) * safePageSize + items.length;
          if (endOffset >= page.total) {
            return;
          }
        }
        continue;
      }

      const expectedPageSize = serverPageSize ?? safePageSize;
      if (items.length < expectedPageSize) {
        return;
      }
    }
  });
};

/**
 * 基于 `cursor + nextCursor` 协议的通用自动分页迭代器（适用于 `apps.logs.search` 等无总数游标接口）。
 */
export const createCursorPaginator = <TItem, TCursor>({
  fetchPage,
  initialCursor,
  maxItems,
  maxPages,
  signal
}: {
  fetchPage: (params: { cursor?: TCursor }) => Promise<CursorPageSlice<TItem, TCursor>>;
  initialCursor?: TCursor;
  maxItems?: number;
  maxPages?: number;
  signal?: AbortSignal;
}): AsyncPageIterable<TItem> =>
  buildAsyncPageIterable<TItem>(async function* () {
    let cursor: TCursor | undefined = initialCursor;
    let yieldedCount = 0;
    let pageCount = 0;

    while (true) {
      if (signal?.aborted) {
        throw new FastGptError({
          message: 'Auto-pagination was aborted',
          cause: signal.reason
        });
      }
      if (maxPages !== undefined && pageCount >= maxPages) {
        return;
      }
      if (maxItems !== undefined && yieldedCount >= maxItems) {
        return;
      }

      const page = await fetchPage(cursor !== undefined ? { cursor } : {});
      const items = page.list;
      if (items.length === 0) {
        return;
      }

      const sliced =
        maxItems !== undefined && yieldedCount + items.length > maxItems
          ? items.slice(0, maxItems - yieldedCount)
          : items;

      yieldedCount += sliced.length;
      pageCount += 1;

      yield sliced;

      if (maxItems !== undefined && yieldedCount >= maxItems) {
        return;
      }
      if (page.nextCursor === undefined || page.nextCursor === null) {
        return;
      }
      cursor = page.nextCursor;
    }
  });

/**
 * 从 AutoPagingOptions 中剥离分页控制字段，提取传递给底层单页请求的 RequestOptions。
 */
export const splitAutoPagingOptions = (
  options?: AutoPagingOptions
): {
  requestOptions?: RequestOptions;
  pageSize?: number;
  maxItems?: number;
  maxPages?: number;
} => {
  if (options === undefined) {
    return {};
  }
  const { pageSize, maxItems, maxPages, ...rest } = options;
  const hasRequestOptions = Object.keys(rest).length > 0;
  return {
    ...(hasRequestOptions ? { requestOptions: rest } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
    ...(maxPages !== undefined ? { maxPages } : {})
  };
};

/**
 * 从 CursorAutoPagingOptions 中剥离游标分页控制字段，提取底层单页请求的 RequestOptions。
 */
export const splitCursorAutoPagingOptions = (
  options?: CursorAutoPagingOptions
): {
  requestOptions?: RequestOptions;
  maxItems?: number;
  maxPages?: number;
} => {
  if (options === undefined) {
    return {};
  }
  const { maxItems, maxPages, ...rest } = options;
  const hasRequestOptions = Object.keys(rest).length > 0;
  return {
    ...(hasRequestOptions ? { requestOptions: rest } : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
    ...(maxPages !== undefined ? { maxPages } : {})
  };
};
