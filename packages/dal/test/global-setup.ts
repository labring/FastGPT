import fs from 'node:fs';

/** 按测试环境优先级定位 DAL 专属环境文件。 */
const getEnvFilePath = (): URL | undefined => {
  const packageRoot = new URL('../', import.meta.url);
  const envFiles = ['.env.test.local', '.env.test', '.env.local', '.env'];

  return envFiles
    .map((fileName) => new URL(fileName, packageRoot))
    .find((filePath) => fs.existsSync(filePath));
};

/** 在 Vitest worker 启动前加载 DAL integration 所需的环境变量。 */
export const setup = () => {
  const envFilePath = getEnvFilePath();
  if (envFilePath) {
    process.loadEnvFile(envFilePath);
  }
};

export const teardown = () => undefined;
