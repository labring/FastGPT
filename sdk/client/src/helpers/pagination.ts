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

export type PageSlice<TItem> = {
  list: TItem[];
  total?: number;
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
      if (isFiniteTotal(page.total)) {
        // 服务端存在 total 时以实际偏移量与 total 为准，避免服务端把 pageSize 截断到上限（如 500 或更低）时误判为末页。
        if (offset >= page.total) {
          return;
        }
        continue;
      }
      if (items.length < requestedPageSize) {
        return;
      }
    }
  });
};

/**
 * 基于 `pageNum + pageSize` 协议（从 1 开始）的通用自动分页迭代器。
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
    let effectivePageSize = safePageSize;
    let fetchedCount = (safeInitialPageNum - 1) * effectivePageSize;
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

      const page = await fetchPage({
        pageNum,
        pageSize: effectivePageSize
      });

      const items = page.list;
      if (items.length === 0) {
        return;
      }

      // 若首页返回条数小于请求页大小但 total 显示仍有后续数据，说明服务端对该接口截断了 pageSize；
      // 同步收敛 effectivePageSize 与服务端生效页大小一致，确保后续 pageNum 偏移连续不跳页。
      if (
        pageCount === 0 &&
        isFiniteTotal(page.total) &&
        items.length < effectivePageSize &&
        (safeInitialPageNum - 1) * items.length + items.length < page.total
      ) {
        effectivePageSize = items.length;
        fetchedCount = (safeInitialPageNum - 1) * effectivePageSize;
      }

      const sliced =
        maxItems !== undefined && yieldedCount + items.length > maxItems
          ? items.slice(0, maxItems - yieldedCount)
          : items;

      yieldedCount += sliced.length;
      fetchedCount += items.length;
      pageNum += 1;
      pageCount += 1;

      yield sliced;

      if (maxItems !== undefined && yieldedCount >= maxItems) {
        return;
      }
      if (isFiniteTotal(page.total)) {
        if (fetchedCount >= page.total) {
          return;
        }
        continue;
      }
      if (items.length < effectivePageSize) {
        return;
      }
    }
  });
};

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
