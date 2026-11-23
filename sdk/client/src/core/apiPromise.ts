import type { WithRawResponseResult } from './types';

/**
 * 同时支持直接 `await` 获取解包后业务数据 `T`，以及通过 `.withRawResponse()`
 * 获取 `{ data, response }`（含 HTTP 状态码、Headers 与 requestId）的响应 Promise。
 *
 * 内部共享单次底层请求 Promise，保证只发起一次网络调用且不会产生未捕获的派生 Promise 告警。
 */
export class ApiPromise<T> implements Promise<T> {
  private readonly _rawPromise: Promise<WithRawResponseResult<T>>;
  private _unwrappedPromise: Promise<T> | null = null;

  constructor(executor: () => Promise<WithRawResponseResult<T>>) {
    this._rawPromise = executor();
  }

  readonly [Symbol.toStringTag] = 'ApiPromise';

  private _unwrap(): Promise<T> {
    if (this._unwrappedPromise === null) {
      this._unwrappedPromise = this._rawPromise.then((res) => res.data);
    }
    return this._unwrappedPromise;
  }

  /**
   * 返回包含解包业务数据与原始 HTTP 元信息（status / headers / requestId / url）的完整结果。
   */
  withRawResponse(): Promise<WithRawResponseResult<T>> {
    return this._rawPromise;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._unwrap().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<T | TResult> {
    return this._unwrap().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return this._unwrap().finally(onfinally);
  }
}
