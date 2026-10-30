import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  // 必须在导入 serviceEnv 前加载 App 配置；外部显式提供的环境变量始终优先。
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) loadEnvFile(file);
  }
  void import('@fastgpt/service/common/vectorDB/mongo/migration')
    .then(({ runPgEmbeddingMigration }) => runPgEmbeddingMigration(process.argv.slice(2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'Embedding migration failed');
      process.exitCode = 1;
    });
}
