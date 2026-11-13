import { disposeLogger, getLogger } from '@fastgpt-sdk/otel/logger';
import { parseProxyEnv } from './env';
import { startProxyServers } from './server';
import { configureLogger, LogCategories } from './utils/logger';

const SHUTDOWN_GRACE_PERIOD_MS = 5_000;

await configureLogger();
const logger = getLogger(LogCategories.MODULE.OPENSANDBOX_PROXY.SERVER);

const config = parseProxyEnv(process.env);
const running = startProxyServers(config);

logger.info('OpenSandbox edge proxy started', {
  mode: running.previewServer !== undefined ? 'split-port' : 'single-port',
  port: running.mainServer.port,
  previewPort: running.previewServer?.port ?? null,
  fastgptAppUrl: config.fastgptAppUrl
});

let shuttingDown = false;

/**
 * 优雅退出处理：防重入停止监听，给予在途预览流短暂排空窗口，超时后强制收口连接并刷新日志。
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info('Received termination signal, shutting down OpenSandbox edge proxy', { signal });

  const forceTimer = setTimeout(() => {
    void running.stop(true);
  }, SHUTDOWN_GRACE_PERIOD_MS);
  forceTimer.unref?.();

  try {
    await running.stop(false);
  } finally {
    clearTimeout(forceTimer);
    await disposeLogger().catch(() => {});
  }

  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
