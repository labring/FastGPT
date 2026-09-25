import { serviceEnv } from '../../env';
import { getLogger, LogCategories } from '../logger';

const logger = getLogger(LogCategories.SYSTEM);

export const MAX_SERVER_PROBE_TIMEOUT_MS = 2000;
export const MAX_SERVER_CACHE_TTL_SUCCESS_MS = 30000;
export const MAX_SERVER_CACHE_TTL_FAIL_MS = 5000;

type MaxServerStatusCache = {
  status: boolean;
  expireTime: number;
};

let maxServerStatusCache: MaxServerStatusCache | null = null;
let probingPromise: Promise<boolean> | null = null;

/**
 * 清除 Max 服务可用性探测缓存（供单测或强制重置使用）
 */
export function resetMaxServerProbeCache() {
  maxServerStatusCache = null;
  probingPromise = null;
}

/**
 * 初始化全局 Max 服务可用性状态。
 * 供服务启动时作为独立前置步骤调用，探测并将结果写入 global.hasMax。
 *
 * @param force 是否跳过缓存强制重新探测
 */
export async function initMaxServerStatus(force = true): Promise<boolean> {
  const isAvailable = await checkMaxServerAvailable(force);
  global.hasMax = isAvailable;
  if (global.feConfigs) {
    global.feConfigs.hasMax = isAvailable;
  }
  return isAvailable;
}

/**
 * 刷新全局 Max 服务可用性状态。
 * 利用内置 TTL 缓存检查 Max 服务健康度；若状态变化，则同步更新 global.hasMax 及 global.feConfigs.hasMax。
 *
 * @param force 是否强制跳过缓存重新探测
 * @returns 当前是否可用
 */
export async function refreshMaxServerStatus(force = false): Promise<boolean> {
  const isAvailable = await checkMaxServerAvailable(force);
  if (global.hasMax !== isAvailable) {
    global.hasMax = isAvailable;
    if (global.feConfigs) {
      global.feConfigs.hasMax = isAvailable;
    }
  }
  return isAvailable;
}

/**
 * 探测 Max 扩展服务健康状态。
 *
 * 当未配置 MAX_URL 时直接返回 false；
 * 当配置了 MAX_URL 时，向 `/healthz` 发送带超时的探活请求。
 * 探测结果存入内存 TTL 缓存并对并发在途请求做合并去重。
 *
 * @param force 是否跳过缓存强制重新探测
 */
export async function checkMaxServerAvailable(force = false): Promise<boolean> {
  if (!serviceEnv.MAX_URL) {
    return false;
  }

  const now = Date.now();
  if (!force && maxServerStatusCache && maxServerStatusCache.expireTime > now) {
    return maxServerStatusCache.status;
  }

  if (!force && probingPromise) {
    return probingPromise;
  }

  const probe = async () => {
    const probeStartTime = Date.now();
    try {
      const healthUrl = new URL('/healthz', serviceEnv.MAX_URL).toString();
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(MAX_SERVER_PROBE_TIMEOUT_MS)
      });

      const isAvailable = response.ok;
      maxServerStatusCache = {
        status: isAvailable,
        expireTime:
          probeStartTime +
          (isAvailable ? MAX_SERVER_CACHE_TTL_SUCCESS_MS : MAX_SERVER_CACHE_TTL_FAIL_MS)
      };

      if (!isAvailable) {
        logger.warn('Max server health check returned non-ok status', {
          maxUrl: serviceEnv.MAX_URL,
          status: response.status
        });
      }

      return isAvailable;
    } catch (error) {
      logger.warn('Max server health check failed, disabling Max features', {
        maxUrl: serviceEnv.MAX_URL,
        error
      });
      maxServerStatusCache = {
        status: false,
        expireTime: probeStartTime + MAX_SERVER_CACHE_TTL_FAIL_MS
      };
      return false;
    } finally {
      probingPromise = null;
    }
  };

  probingPromise = probe();
  return probingPromise;
}
