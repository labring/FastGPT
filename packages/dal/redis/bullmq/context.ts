import { BULLMQ_RUNTIME_CONTEXT_SYMBOL, DEFAULT_BULLMQ_RESOURCE_ID } from './constants';
import { RedisBullMQRuntime } from './runtime';
import type { RedisBullMQRuntimeOptions } from './types';

type BullMQRuntimeContext = {
  resources: Map<string, RedisBullMQRuntime>;
};

const getBullMQRuntimeContext = (): BullMQRuntimeContext => {
  const existing = Reflect.get(globalThis, BULLMQ_RUNTIME_CONTEXT_SYMBOL) as
    | BullMQRuntimeContext
    | undefined;
  if (existing) return existing;

  const context: BullMQRuntimeContext = { resources: new Map() };
  Reflect.set(globalThis, BULLMQ_RUNTIME_CONTEXT_SYMBOL, context);
  return context;
};

/** 获取或复用进程级 BullMQ Runtime，避免 Next.js 热重载重复创建 Queue/Worker。 */
export const getRedisBullMQRuntime = (options: RedisBullMQRuntimeOptions) => {
  const context = getBullMQRuntimeContext();
  const existing = context.resources.get(DEFAULT_BULLMQ_RESOURCE_ID);

  if (existing?.getState() === 'closed') {
    context.resources.delete(DEFAULT_BULLMQ_RESOURCE_ID);
  } else if (existing) {
    if (existing.redisRuntime !== options.redisRuntime) {
      throw new Error('BullMQ runtime is already bound to a different Redis runtime');
    }
    return existing;
  }

  const runtime = new RedisBullMQRuntime(options);
  context.resources.set(DEFAULT_BULLMQ_RESOURCE_ID, runtime);
  return runtime;
};

/** 返回已配置的进程级 Runtime，不会因读取而创建 Redis 连接。 */
export const getConfiguredRedisBullMQRuntime = () =>
  getBullMQRuntimeContext().resources.get(DEFAULT_BULLMQ_RESOURCE_ID);
