import {
  SessionLifecycleSchema,
  type SessionLifecycle
} from '@fastgpt/global/support/user/session/type';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';
import {
  SESSION_PREFRESH_MS,
  SESSION_CONTEXT_HEADER
} from '@fastgpt/global/support/user/session/constants';

export type SessionRequestSnapshot = {
  epoch: number;
  generation?: number;
  sessionId?: string;
  contextVersion?: number;
  refreshFailure?: unknown;
};

/** 非认证上下文约束，防止跨标签页 Cookie 已变化时旧请求在新团队 / 新账号下执行。 */
export const getSessionContextHeaders = (
  snapshot?: Pick<SessionRequestSnapshot, 'sessionId' | 'contextVersion'>
): Record<string, string> =>
  snapshot?.sessionId && snapshot.contextVersion
    ? { [SESSION_CONTEXT_HEADER]: `${snapshot.sessionId}.${snapshot.contextVersion}` }
    : {};

/** 只有显式修改认证上下文的接口，才允许通过自身成功响应提交新的上下文。 */
export const isSessionContextMutation = (url: string) =>
  /\/(?:admin\/team\/switch|(?:proApi\/)?support\/user\/(?:team\/switch|account\/password\/(?:activate|update|updateRoot)))(?:\?|$)/.test(
    url
  );

/** 旧登录 / 团队上下文的请求应静默结束，不能在新的身份下重新发送。 */
export class SessionRequestContextChangedError extends Error {
  constructor() {
    super('Session request context changed');
  }
}

/** 同时识别 Axios 错误 envelope 和独立 fetch 返回的业务错误。 */
export const getSessionErrorReason = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return typeof error === 'string' ? error : undefined;
  const value = error as {
    statusText?: unknown;
    message?: unknown;
    response?: { data?: { statusText?: unknown } };
  };
  const reason = value.response?.data?.statusText ?? value.statusText ?? value.message;
  return typeof reason === 'string' ? reason : undefined;
};

export const isRecoverableSessionError = (error: unknown) => {
  const reason = getSessionErrorReason(error);
  return reason === SessionErrEnum.accessExpired || reason === SessionErrEnum.accessMissing;
};

const isTerminalSessionError = (error: unknown) =>
  [
    SessionErrEnum.accessInvalid,
    SessionErrEnum.revoked,
    SessionErrEnum.refreshExpired,
    SessionErrEnum.refreshInvalid,
    SessionErrEnum.refreshReused,
    SessionErrEnum.contextChanged
  ].includes(getSessionErrorReason(error) as SessionErrEnum);

/**
 * 页内认证协调器。AT 到期依据服务端剩余时间换算为本地单调时钟，不持有任何凭证。
 * 多标签页由服务端原子轮换和幂等处理，正确性不依赖浏览器锁或广播。
 */
export class SessionCoordinator {
  private session: SessionLifecycle | null | undefined;
  private deadline = 0;
  private epoch = 0;
  private stopped = false;
  private refreshPromise?: Promise<void>;
  private initializePromise?: Promise<void>;
  private retryAt = 0;
  private lastRefreshFailure?: unknown;
  private stoppedContext?: Pick<SessionLifecycle, 'sessionId' | 'contextVersion'>;
  private readonly onContextChanged?: () => void;
  private readonly now: () => number;
  private readonly request: (
    action: 'status' | 'refresh',
    context?: SessionRequestSnapshot
  ) => Promise<{ session: SessionLifecycle | null }>;

  constructor({
    request,
    now = () => performance.now(),
    onContextChanged
  }: {
    request: (
      action: 'status' | 'refresh',
      context?: SessionRequestSnapshot
    ) => Promise<{ session: SessionLifecycle | null }>;
    now?: () => number;
    onContextChanged?: () => void;
  }) {
    this.request = request;
    this.now = now;
    this.onContextChanged = onContextChanged;
  }

  /** 外部标签页变更身份时停止旧页面的请求，交由页面重新加载完整身份与团队数据。 */
  private rejectRemoteContextChange(): never {
    this.stop();
    this.onContextChanged?.();
    throw new SessionRequestContextChangedError();
  }

  private observeRemoteSession(session: SessionLifecycle | null, elapsedMs: number) {
    if (
      this.session !== undefined &&
      ((this.session === null) !== (session === null) ||
        (this.session &&
          session &&
          (this.session.sessionId !== session.sessionId ||
            this.session.contextVersion !== session.contextVersion)))
    )
      this.rejectRemoteContextChange();
    this.observe(session, { elapsedMs });
  }

  /** 接收公开元数据；迟到的旧代响应不能回退本地时间或安全上下文。 */
  observe(
    value: unknown,
    { login = false, elapsedMs = 0 }: { login?: boolean; elapsedMs?: number } = {}
  ) {
    if (this.stopped && !login) return;
    const parsed = value === null ? null : SessionLifecycleSchema.safeParse(value);
    if (parsed !== null && !parsed.success) return;
    const next = parsed === null ? null : parsed.data;
    // 迟到的普通响应不能覆盖显式新登录；外部身份变化由 status / refresh 触发整页重载。
    if (!login && this.session && (!next || next.sessionId !== this.session.sessionId)) return;
    if (
      next &&
      this.session?.sessionId === next.sessionId &&
      (next.contextVersion < this.session.contextVersion ||
        (next.contextVersion === this.session.contextVersion &&
          next.generation < this.session.generation))
    )
      return;
    if (
      login ||
      (this.session &&
        next &&
        (this.session.sessionId !== next.sessionId ||
          this.session.contextVersion !== next.contextVersion))
    )
      this.epoch++;
    if (login) {
      this.stopped = false;
      this.stoppedContext = undefined;
    }
    const sameGeneration =
      !login &&
      next &&
      this.session &&
      next.sessionId === this.session.sessionId &&
      next.contextVersion === this.session.contextVersion &&
      next.generation === this.session.generation;
    const deadline = next
      ? this.now() + Math.max(0, next.accessExpiresAt - next.serverTime - elapsedMs)
      : 0;
    // 同一代迟到响应可能携带较旧 serverTime，只允许缩短本地剩余时间，不能凭此延长。
    this.deadline = sameGeneration ? Math.min(this.deadline, deadline) : deadline;
    this.session = next;
    this.lastRefreshFailure = undefined;
    this.retryAt = 0;
  }

  /** 主动退出先阻止新刷新，并使所有旧请求快照失效。 */
  stop() {
    if (this.session)
      this.stoppedContext = {
        sessionId: this.session.sessionId,
        contextVersion: this.session.contextVersion
      };
    this.stopped = true;
    this.epoch++;
    this.session = undefined;
  }

  get hasSession() {
    return Boolean(this.session) && !this.stopped;
  }

  /** 主动退出在停止普通请求后仍需携带原上下文，不能撤销其他标签页刚建立的登录。 */
  get contextHeaders() {
    return getSessionContextHeaders(this.session ?? this.stoppedContext);
  }

  /** 主动退出等待页内在途刷新收尾，随后服务端撤销，避免自己的旧刷新回包晚于退出。 */
  async waitForRefresh() {
    await this.refreshPromise?.catch(() => {});
  }

  private snapshot(refreshFailure?: unknown): SessionRequestSnapshot {
    return {
      epoch: this.epoch,
      generation: this.session?.generation,
      sessionId: this.session?.sessionId,
      contextVersion: this.session?.contextVersion,
      refreshFailure
    };
  }

  private assertContext(snapshot: SessionRequestSnapshot) {
    if (this.stopped || snapshot.epoch !== this.epoch)
      throw new SessionRequestContextChangedError();
  }

  /**
   * 成功响应交给业务层前也要校验上下文，防止旧用户 / 团队的数据回写新页面。
   * 自身改密 / 切团队可以提交新上下文，但其响应必须仍对应当前已观察到的同一 Session。
   */
  assertResponseContext(snapshot: SessionRequestSnapshot, committedHeader?: unknown) {
    if (!this.stopped && snapshot.epoch === this.epoch) return;
    if (!this.stopped && typeof committedHeader === 'string') {
      try {
        const parsed = SessionLifecycleSchema.safeParse(JSON.parse(committedHeader));
        if (
          parsed.success &&
          parsed.data.sessionId === snapshot.sessionId &&
          parsed.data.sessionId === this.session?.sessionId &&
          parsed.data.contextVersion === this.session.contextVersion &&
          parsed.data.contextVersion > (snapshot.contextVersion ?? 0)
        )
          return;
      } catch {
        /* 损坏的展示元数据不能豁免上下文校验。 */
      }
    }
    this.assertContext(snapshot);
  }

  /** 取消单个等待者不能中止所有请求共用的刷新；每个监听均在等待完成后清理。 */
  private wait(promise: Promise<void>, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (!signal) return promise;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        () => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        }
      );
    });
  }

  /** 页内只执行一个刷新；临时失败建立短退避，防止并发请求持续冲击刷新接口。 */
  private refresh(): Promise<void> {
    if (this.stopped) return Promise.reject(new SessionRequestContextChangedError());
    if (this.refreshPromise) return this.refreshPromise;
    if (this.lastRefreshFailure && this.now() < this.retryAt)
      return Promise.reject(this.lastRefreshFailure);
    const snapshot = this.snapshot();
    const started = this.now();
    const pending = this.request('refresh', snapshot)
      .then((result) => {
        this.assertContext(snapshot);
        if (!result.session) throw new Error('Missing refreshed session lifecycle');
        this.observeRemoteSession(result.session, this.now() - started);
      })
      .catch((error) => {
        if (
          snapshot.epoch === this.epoch &&
          getSessionErrorReason(error) === SessionErrEnum.contextChanged
        )
          this.rejectRemoteContextChange();
        if (snapshot.epoch === this.epoch) {
          this.lastRefreshFailure = error;
          this.retryAt = this.now() + 3000;
        }
        throw error;
      })
      .finally(() => {
        if (this.refreshPromise === pending) this.refreshPromise = undefined;
      });
    this.refreshPromise = pending;
    return pending;
  }

  /** 页面重载或恢复前台时重新读取服务端时间；Access 缺失 / 过期才转入 RT 恢复。 */
  synchronize(): Promise<void> {
    if (this.stopped) return Promise.reject(new SessionRequestContextChangedError());
    if (this.initializePromise) return this.initializePromise;
    const snapshot = this.snapshot();
    const started = this.now();
    const pending = this.request('status')
      .then((result) => {
        this.assertContext(snapshot);
        this.observeRemoteSession(result.session, this.now() - started);
      })
      .catch(async (error) => {
        this.assertContext(snapshot);
        if (isRecoverableSessionError(error)) return this.refresh();
        throw error;
      })
      .finally(() => {
        if (this.initializePromise === pending) this.initializePromise = undefined;
      });
    this.initializePromise = pending;
    return pending;
  }

  /** 认证初始化触发一次 status；已知登录临近到期时先完成刷新，再让原业务发送一次。 */
  async beforeRequest({
    initialize = false,
    signal
  }: { initialize?: boolean; signal?: AbortSignal } = {}) {
    signal?.throwIfAborted();
    if (this.stopped) throw new SessionRequestContextChangedError();
    const initialContext = this.snapshot();
    if (this.initializePromise) await this.wait(this.initializePromise, signal);
    else if (initialize && this.session === undefined) await this.wait(this.synchronize(), signal);
    if (this.session && this.deadline - this.now() <= SESSION_PREFRESH_MS) {
      try {
        await this.wait(this.refresh(), signal);
      } catch (error) {
        if (
          signal?.aborted ||
          error instanceof SessionRequestContextChangedError ||
          isTerminalSessionError(error) ||
          this.deadline <= this.now()
        )
          throw error;
        return this.snapshot(error);
      }
    }
    signal?.throwIfAborted();
    if (initialContext.sessionId) this.assertContext(initialContext);
    return this.snapshot();
  }

  /** 只恢复业务执行前的 Access 拒绝；已有更新凭证时直接重试，避免迟到 401 引起二次轮换。 */
  async recover(
    error: unknown,
    { snapshot, signal }: { snapshot: SessionRequestSnapshot; signal?: AbortSignal }
  ): Promise<boolean> {
    if (getSessionErrorReason(error) === SessionErrEnum.contextChanged) {
      this.assertContext(snapshot);
      this.rejectRemoteContextChange();
    }
    if (!isRecoverableSessionError(error)) {
      if (!snapshot.sessionId || !isTerminalSessionError(error)) return false;
      this.assertContext(snapshot);
      // Cookie 可能已被其他标签页的新登录替换。先核对当前身份，不能用旧 401 清理新页面状态。
      try {
        await this.wait(this.synchronize(), signal);
      } catch (cause) {
        if (cause instanceof SessionRequestContextChangedError || signal?.aborted) throw cause;
        if (!isTerminalSessionError(cause)) throw cause;
        return false;
      }
      this.assertContext(snapshot);
      return false;
    }
    this.assertContext(snapshot);
    if (snapshot.refreshFailure) throw snapshot.refreshFailure;
    if (
      snapshot.generation !== undefined &&
      this.session &&
      snapshot.generation < this.session.generation &&
      this.deadline > this.now()
    )
      return true;
    await this.wait(this.refresh(), signal);
    this.assertContext(snapshot);
    return true;
  }
}
