import type { RedisRuntimeMetrics } from '@fastgpt/dal/redis/types';
import { getMeter } from '@fastgpt-sdk/otel/metrics';

/**
 * 将 DAL Redis Runtime 的观测 port 绑定到应用 OpenTelemetry meter。
 * Runtime 本身不依赖 OTel，测试可以直接注入 recorder 而不初始化 exporter。
 */
export const createRedisRuntimeMetrics = (): RedisRuntimeMetrics => {
  const meter = getMeter('fastgpt.redis.runtime');
  const activeConnections = meter.createUpDownCounter('fastgpt.redis.connections.active', {
    description: 'Currently active Redis Runtime connections',
    unit: 'connections'
  });
  const createdConnections = meter.createCounter('fastgpt.redis.connections.created', {
    description: 'Redis Runtime connections created',
    unit: 'connections'
  });
  const connectionErrors = meter.createCounter('fastgpt.redis.connections.errors', {
    description: 'Redis Runtime connection errors',
    unit: 'errors'
  });
  const healthChecks = meter.createCounter('fastgpt.redis.health.checks', {
    description: 'Redis Runtime health checks',
    unit: 'checks'
  });
  const healthDuration = meter.createHistogram('fastgpt.redis.health.duration', {
    description: 'Redis Runtime health check duration',
    unit: 'ms'
  });
  const shutdownDuration = meter.createHistogram('fastgpt.redis.shutdown.duration', {
    description: 'Redis Runtime shutdown duration',
    unit: 'ms'
  });

  return {
    connectionCreated: (role) => {
      const attributes = { role };
      activeConnections.add(1, attributes);
      createdConnections.add(1, attributes);
    },
    connectionClosed: (role) => {
      activeConnections.add(-1, { role });
    },
    connectionError: (role) => {
      connectionErrors.add(1, { role });
    },
    healthCheck: ({ success, latencyMs }) => {
      const attributes = { outcome: success ? 'success' : 'error' };
      healthChecks.add(1, attributes);
      healthDuration.record(latencyMs, attributes);
    },
    shutdownCompleted: ({ durationMs }) => {
      shutdownDuration.record(durationMs);
    }
  };
};
