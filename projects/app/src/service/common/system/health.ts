import { getErrText } from '@fastgpt/global/common/error/utils';
import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { S3Buckets } from '@fastgpt/service/common/s3/constants';
import { InitialErrorEnum } from '@fastgpt/service/common/system/constants';
import { loadModelProviders } from '@fastgpt/service/thirdProvider/fastgptPlugin/model';
import { codeSandbox } from '@fastgpt/service/thirdProvider/codeSandbox';

export const instrumentationCheck = async () => {
  const logger = getLogger(LogCategories.SYSTEM);
  logger.info('instrumentation check start');
  /* infra */
  // vectorDB - 已验证
  // mongo - 已验证
  // redis - 已验证
  // s3
  try {
    await global.s3BucketMap[S3Buckets.public].checkBucketHealth();
  } catch (error) {
    return Promise.reject(`[${InitialErrorEnum.S3_ERROR}] public bucket: ${getErrText(error)}`);
  }
  try {
    await global.s3BucketMap[S3Buckets.private].checkBucketHealth();
  } catch (error) {
    return Promise.reject(`[${InitialErrorEnum.S3_ERROR}] private bucket: ${getErrText(error)}`);
  }

  /* server */
  // plugin
  try {
    await loadModelProviders();
  } catch (error) {
    const message = `[${InitialErrorEnum.PLUGIN_ERROR}]: ${getErrText(error)}`;
    console.error(message);
    return Promise.reject(message);
  }
  // pro
  if (global.feConfigs?.isPlus) {
    try {
      const data = await POST<{ auth: boolean; data: string }>('/admin/common/health');
      if (!data.auth) {
        throw new Error('Root key is invalid');
      }
    } catch (error) {
      const message = `[${InitialErrorEnum.PRO_ERROR}]: ${getErrText(error)}`;
      console.error(message, { error });
      return Promise.reject(message);
    }
  }
  // sandbox
  try {
    await codeSandbox.runCode({
      codeType: SandboxCodeTypeEnum.py,
      code: `def main():
    print("Hello, World!")
    return {}`,
      variables: {}
    });
  } catch (error) {
    console.warn(`${InitialErrorEnum.SANDBOX_ERROR}]: ${getErrText(error)}`);
  }
  logger.info('instrumentation check finish');
};
