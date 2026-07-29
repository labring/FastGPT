import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { parseRedisConnectionConfig, type RedisEndpoint } from './config';
import { getConnectionOptions, getInitialConnectionState } from './policy';
import { runWithTimeout } from './timeout';
import type { RedisRuntimeLogger } from '../types';

export type { RedisRuntimeLogger } from '../types';

export type RedisClient = Redis;
export type RedisConnectionRole = 'command' | 'blocking' | 'queue' | 'worker';
export type RedisConnectionState =
  | 'connecting'
  | 'connected'
  | 'ready'
  | 'reconnecting'
  | 'closed'
  | 'ended';

export type RedisConnectionSnapshot = {
  id: number;
  role: RedisConnectionRole;
  state: RedisConnectionState;
  createdAt: number;
  lastErrorAt?: number;
};

export type RedisClientFactory = (options: RedisOptions) => RedisClient;

export type RedisBeforeCloseHook = {
  name: string;
  close: () => Promise<void> | void;
};

const silentLogger: RedisRuntimeLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 3_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;
const DEFAULT_BEFORE_CLOSE_TIMEOUT_MS = 15_000;

export type RedisRuntimeOptions = {
  redisUrl: string;
  logger?: RedisRuntimeLogger;
  clientFactory?: RedisClientFactory;
  healthCheckTimeoutMs?: number;
  closeTimeoutMs?: number;
  beforeCloseTimeoutMs?: number;
};

/**
 * 进程级 Redis Runtime。
 *
 * Runtime 统一管理不同角色的连接、状态、健康检查和关闭。所有 command 操作都经过
 * DAL adapter 显式转换 physical key，不再创建带隐式 keyPrefix 的 legacy client。
 */
export class RedisRuntime {
  readonly endpoint: RedisEndpoint;

  private readonly endpointOptions: RedisOptions;
  private readonly logger: RedisRuntimeLogger;
  private readonly clientFactory: RedisClientFactory;
  private readonly healthCheckTimeoutMs: number;
  private readonly closeTimeoutMs: number;
  private readonly beforeCloseTimeoutMs: number;
  private readonly connections = new Map<RedisClient, RedisConnectionSnapshot>();
  private readonly connectionClosePromises = new Map<RedisClient, Promise<void>>();
  private readonly beforeCloseHooks = new Map<string, RedisBeforeCloseHook['close']>();
  private nextConnectionId = 1;
  private commandClient: RedisClient | undefined;
  private state: 'open' | 'closing' | 'closed' = 'open';
  private closePromise: Promise<void> | undefined;

  constructor({
    redisUrl,
    logger = silentLogger,
    clientFactory = (options) => new Redis(options),
    healthCheckTimeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
    closeTimeoutMs = DEFAULT_CLOSE_TIMEOUT_MS,
    beforeCloseTimeoutMs = DEFAULT_BEFORE_CLOSE_TIMEOUT_MS
  }: RedisRuntimeOptions) {
    const { options: endpointOptions, endpoint } = parseRedisConnectionConfig(redisUrl);
    this.endpointOptions = endpointOptions;
    this.endpoint = endpoint;
    this.logger = logger;
    this.clientFactory = clientFactory;
    this.healthCheckTimeoutMs = healthCheckTimeoutMs;
    this.closeTimeoutMs = closeTimeoutMs;
    this.beforeCloseTimeoutMs = beforeCloseTimeoutMs;

    // 保留工厂返回对象原有的可解构调用行为，传给回调时也不会丢失 Runtime 上下文。
    this.getState = this.getState.bind(this);
    this.getCommandConnection = this.getCommandConnection.bind(this);
    this.createBlockingConnection = this.createBlockingConnection.bind(this);
    this.createQueueConnection = this.createQueueConnection.bind(this);
    this.createWorkerConnection = this.createWorkerConnection.bind(this);
    this.registerBeforeCloseHook = this.registerBeforeCloseHook.bind(this);
    this.getConnectionSnapshot = this.getConnectionSnapshot.bind(this);
    this.checkHealth = this.checkHealth.bind(this);
    this.releaseConnection = this.releaseConnection.bind(this);
    this.close = this.close.bind(this);
  }

  private updateConnection(
    client: RedisClient,
    state: RedisConnectionState,
    extra?: Pick<RedisConnectionSnapshot, 'lastErrorAt'>
  ) {
    const connection = this.connections.get(client);
    if (!connection) return;

    this.connections.set(client, {
      ...connection,
      ...extra,
      state
    });
  }

  private defineConnection(client: RedisClient, role: RedisConnectionRole) {
    this.connections.set(client, {
      id: this.nextConnectionId++,
      role,
      state: getInitialConnectionState(client),
      createdAt: Date.now()
    });

    client.on('connect', () => {
      this.updateConnection(client, 'connected');
      this.logger.info('Redis connection established', { role });
    });
    client.on('ready', () => {
      this.updateConnection(client, 'ready');
      this.logger.info('Redis connection ready', { role });
    });
    client.on('reconnecting', () => {
      this.updateConnection(client, 'reconnecting');
    });
    client.on('error', (error: Error) => {
      this.updateConnection(client, this.connections.get(client)?.state ?? 'connecting', {
        lastErrorAt: Date.now()
      });
      this.logger.error('Redis connection error', { role, error });
    });
    client.on('close', () => {
      this.updateConnection(client, 'closed');
      this.logger.warn('Redis connection closed', { role });
    });
    client.on('end', () => {
      this.updateConnection(client, 'ended');
      this.connections.delete(client);
      if (this.commandClient === client) {
        this.commandClient = undefined;
      }
    });

    return client;
  }

  private assertOpen() {
    if (this.state !== 'open') {
      throw new Error(`Redis runtime is ${this.state}`);
    }
  }

  private createConnection(role: RedisConnectionRole) {
    this.assertOpen();
    const client = this.clientFactory(
      getConnectionOptions({ endpointOptions: this.endpointOptions, role, logger: this.logger })
    );
    return this.defineConnection(client, role);
  }

  getState() {
    return this.state;
  }

  getCommandConnection() {
    this.assertOpen();
    this.commandClient ??= this.createConnection('command');
    return this.commandClient;
  }

  createBlockingConnection() {
    return this.createConnection('blocking');
  }

  createQueueConnection() {
    return this.createConnection('queue');
  }

  createWorkerConnection() {
    return this.createConnection('worker');
  }

  registerBeforeCloseHook({ name, close }: RedisBeforeCloseHook) {
    this.assertOpen();
    this.beforeCloseHooks.set(name, close);

    return () => {
      if (this.beforeCloseHooks.get(name) === close) {
        this.beforeCloseHooks.delete(name);
      }
    };
  }

  getConnectionSnapshot() {
    return Array.from(this.connections.values()).map((item) => ({ ...item }));
  }

  async checkHealth() {
    const startedAt = Date.now();
    const response = await runWithTimeout({
      operation: this.getCommandConnection().ping(),
      timeoutMs: this.healthCheckTimeoutMs,
      timeoutMessage: 'Redis health check timed out'
    });
    if (response !== 'PONG') {
      throw new Error('Redis health check returned an unexpected response');
    }
    return {
      latencyMs: Date.now() - startedAt,
      endpoint: this.endpoint
    };
  }

  releaseConnection(client: RedisClient) {
    const activeClose = this.connectionClosePromises.get(client);
    if (activeClose) return activeClose;
    if (!this.connections.has(client)) return Promise.resolve();

    const role = this.connections.get(client)?.role;
    const connectionClosePromise = (async () => {
      try {
        await runWithTimeout({
          operation: client.quit(),
          timeoutMs: this.closeTimeoutMs,
          timeoutMessage: `Redis ${role ?? 'unknown'} connection close timed out`
        });
      } catch (error) {
        this.logger.warn('Redis graceful close failed, disconnecting socket', {
          role,
          error
        });
        try {
          client.disconnect();
        } catch (disconnectError) {
          this.logger.warn('Redis forced disconnect failed', { role, error: disconnectError });
        }
      } finally {
        this.connections.delete(client);
        this.connectionClosePromises.delete(client);
        if (this.commandClient === client) {
          this.commandClient = undefined;
        }
      }
    })();
    this.connectionClosePromises.set(client, connectionClosePromise);

    return connectionClosePromise;
  }

  close() {
    if (this.closePromise) return this.closePromise;

    this.state = 'closing';
    this.closePromise = (async () => {
      const hooks = Array.from(this.beforeCloseHooks.entries());
      this.beforeCloseHooks.clear();

      for (const [name, closeHook] of hooks) {
        await runWithTimeout({
          operation: Promise.resolve().then(closeHook),
          timeoutMs: this.beforeCloseTimeoutMs,
          timeoutMessage: `Redis before-close hook ${name} timed out`
        }).catch((error) => {
          this.logger.warn('Redis before-close hook failed', { name, error });
        });
      }

      // 阻塞连接先退出，随后关闭队列连接，最后才关闭普通命令连接。
      const closeRoleGroups: readonly RedisConnectionRole[][] = [
        ['blocking'],
        ['worker', 'queue'],
        ['command']
      ];
      for (const roles of closeRoleGroups) {
        const clients = Array.from(this.connections.entries())
          .filter(([, connection]) => roles.includes(connection.role))
          .map(([client]) => client);
        await Promise.all(clients.map(this.releaseConnection));
      }
      this.state = 'closed';
    })();

    return this.closePromise;
  }
}

type RedisRuntimeRegistration = {
  configurationKey: string;
  runtime: RedisRuntime;
};

type DalRuntimeContext = {
  resources: Map<string, RedisRuntimeRegistration>;
};

const DAL_RUNTIME_CONTEXT_SYMBOL = Symbol.for('@fastgpt/dal/runtime-context');
const DEFAULT_REDIS_RESOURCE_ID = 'redis:default';

/** 获取跨模块热重载复用的唯一 DAL Runtime context。 */
const getDalRuntimeContext = (): DalRuntimeContext => {
  const existing = Reflect.get(globalThis, DAL_RUNTIME_CONTEXT_SYMBOL) as
    | DalRuntimeContext
    | undefined;
  if (existing) return existing;

  const context: DalRuntimeContext = { resources: new Map() };
  Reflect.set(globalThis, DAL_RUNTIME_CONTEXT_SYMBOL, context);
  return context;
};

/**
 * 配置默认 Redis Runtime。
 *
 * 同一配置在热重载期间复用同一实例；运行中切换 URL 必须先显式关闭，避免同一进程访问
 * 两个 Redis 实例。配置 key 仅保存在内存中且不会进入错误或日志。
 */
export const configureRedisRuntime = (options: RedisRuntimeOptions): RedisRuntime => {
  const context = getDalRuntimeContext();
  const configurationKey = options.redisUrl.trim();
  const existing = context.resources.get(DEFAULT_REDIS_RESOURCE_ID);

  if (existing?.runtime.getState() === 'closed') {
    context.resources.delete(DEFAULT_REDIS_RESOURCE_ID);
  } else if (existing) {
    if (existing.configurationKey !== configurationKey) {
      throw new Error('Redis runtime is already configured with a different connection target');
    }
    return existing.runtime;
  }

  const runtime = new RedisRuntime(options);
  context.resources.set(DEFAULT_REDIS_RESOURCE_ID, { configurationKey, runtime });
  return runtime;
};

/** 返回已经配置的默认 Runtime；未初始化时不隐式读取环境变量。 */
export const getConfiguredRedisRuntime = (): RedisRuntime | undefined =>
  getDalRuntimeContext().resources.get(DEFAULT_REDIS_RESOURCE_ID)?.runtime;

/** 获取默认 Runtime；应用必须先通过 service binding 或 instrumentation 完成配置。 */
export const getRedisRuntime = (): RedisRuntime => {
  const runtime = getConfiguredRedisRuntime();
  if (!runtime) {
    throw new Error('Redis runtime has not been configured');
  }
  return runtime;
};

/** 关闭并移除当前默认 Runtime；并发替换时只删除本次关闭的原实例。 */
export const closeRedisRuntime = async (): Promise<void> => {
  const context = getDalRuntimeContext();
  const registration = context.resources.get(DEFAULT_REDIS_RESOURCE_ID);
  if (!registration) return;

  await registration.runtime.close();
  if (context.resources.get(DEFAULT_REDIS_RESOURCE_ID) === registration) {
    context.resources.delete(DEFAULT_REDIS_RESOURCE_ID);
  }
};

export type { RedisEndpoint };
