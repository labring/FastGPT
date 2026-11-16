import { systemVersionCache } from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../logger';

type VersionStore = Pick<typeof systemVersionCache, 'getOrInitialize' | 'refresh'>;
type CacheSnapshot<T> = {
  data: T;
  version?: string;
  generation: number;
  expiresAt: number;
};

const logger = getLogger(LogCategories.INFRA.REDIS);

/**
 * 以 Redis 版本失效进程内数据。子类只负责加载业务数据，读取前按需比较版本；
 * maxAgeMs 同时补偿失效通知丢失和不经过本服务的数据源更新。
 */
export abstract class VersionedDataCache<T> {
  private snapshot?: CacheSnapshot<T>;
  private loading?: { version?: string; generation: number; promise: Promise<T> };
  private generation = 0;
  private pendingNotification = false;
  private readonly key: string;
  private readonly maxAgeMs: number;
  private readonly versionStore: VersionStore;

  constructor({
    key,
    maxAgeMs,
    versionStore = systemVersionCache
  }: {
    key: string;
    maxAgeMs: number;
    versionStore?: VersionStore;
  }) {
    this.key = key;
    this.maxAgeMs = maxAgeMs;
    this.versionStore = versionStore;
  }

  protected abstract load(): Promise<T>;

  /** 重试尚未成功发布的版本；不合并不同写入的通知，避免后提交的数据缺少失效事件。 */
  private async publishVersion() {
    const generation = this.generation;
    await this.versionStore.refresh({ key: this.key });
    if (this.generation === generation) this.pendingNotification = false;
  }

  /**
   * 必须在业务数据提交后调用。先使本地快照失效，再通知其他进程；
   * Redis 故障时保留待发布标记，下一次读取重试，错误仍交由写入方处理。
   */
  async refreshVersion() {
    this.generation += 1;
    this.pendingNotification = true;
    await this.publishVersion();
  }

  /** 强制重拉本地数据，不修改共享版本。 */
  refresh() {
    return this.get({ force: true });
  }

  /**
   * 同版本的并发读取共享加载。失败时保留已有快照，首次加载失败则抛错；
   * Redis 不可用时仍按 TTL 重拉，恢复后会重新确认共享版本。
   */
  async get({ force = false }: { force?: boolean } = {}): Promise<T> {
    let version: string | undefined;
    try {
      if (this.pendingNotification) await this.publishVersion();
      version = await this.versionStore.getOrInitialize({ key: this.key });
    } catch (error) {
      logger.warn('Versioned cache version unavailable', { key: this.key, error });
    }

    const generation = this.generation;
    const cached = this.snapshot;
    if (
      !force &&
      cached &&
      cached.generation === generation &&
      // Redis 故障不必立刻丢弃仍在 TTL 内的数据。
      (version === undefined || cached.version === version) &&
      cached.expiresAt > Date.now()
    ) {
      return cached.data;
    }

    if (this.loading) {
      if (this.loading.version === version && this.loading.generation === generation) {
        return this.loading.promise;
      }
      await this.loading.promise;
      return this.get({ force });
    }

    const promise = this.load()
      .then((data) => {
        // 加载期间发生本地写入时，不将旧加载结果发布为新快照。
        if (this.generation === generation) {
          this.snapshot = { data, version, generation, expiresAt: Date.now() + this.maxAgeMs };
        }
        return data;
      })
      .catch((error) => {
        logger.warn('Versioned cache reload failed', { key: this.key, error });
        if (this.snapshot) return this.snapshot.data;
        throw error;
      })
      .finally(() => {
        this.loading = undefined;
      });
    // 版本在加载前捕获，绝不能给旧数据标记加载期间产生的新版本。
    this.loading = { version, generation, promise };
    return promise;
  }
}
