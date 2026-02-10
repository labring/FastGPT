import { getErrText } from '@fastgpt/global/common/error/utils';
import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { S3Buckets } from '@fastgpt/service/common/s3/constants';
import { runCode } from '@fastgpt/service/core/workflow/dispatch/tools/codeSandbox';
import { loadModelProviders } from '@fastgpt/service/thirdProvider/fastgptPlugin/model';

export const ErrorEnum = {
  S3_ERROR: 's3_error',
  MONGO_ERROR: 'mongo_error',
  REDIS_ERROR: 'redis_error',
  VECTORDB_ERROR: 'vectordb_error',
  PLUGIN_ERROR: 'plugin_error',
  PRO_ERROR: 'pro_error',
  SANDBOX_ERROR: 'code_sandbox_error',
  MCP_SERVER_ERROR: 'mcp_server_error'
};
export const instrumentationCheck = async () => {
  console.log('instrumentationCheck start');
  /* infra */
  // vectorDB - 已验证
  // mongo - 已验证
  // redis - 已验证
  // s3
  try {
    await global.s3BucketMap[S3Buckets.public].checkBucketHealth();
  } catch (error) {
    return Promise.reject(`[${ErrorEnum.S3_ERROR}] public bucket: ${getErrText(error)}`);
  }
  try {
    await global.s3BucketMap[S3Buckets.private].checkBucketHealth();
  } catch (error) {
    return Promise.reject(`[${ErrorEnum.S3_ERROR}] private bucket: ${getErrText(error)}`);
  }

  /* server */
  // plugin
  try {
    await loadModelProviders();
  } catch (error) {
    return Promise.reject(`[${ErrorEnum.PLUGIN_ERROR}]: ${getErrText(error)}`);
  }
  // pro
  if (global.feConfigs?.isPlus) {
    try {
      const data = await POST<{ auth: boolean; data: string }>('/admin/common/health');
      if (!data.auth) {
        return Promise.reject(`[${ErrorEnum.PRO_ERROR}]: Root key is invalid`);
      }
    } catch (error) {
      return Promise.reject(`[${ErrorEnum.PRO_ERROR}]: ${getErrText(error)}`);
    }
  }
  // sandbox
  try {
    await runCode({
      codeType: SandboxCodeTypeEnum.py,
      code: `def main():
    print("Hello, World!")
    return {
    }
`,
      variables: {}
    });
  } catch (error) {
    console.warn(`[${ErrorEnum.SANDBOX_ERROR}]: ${getErrText(error)}`);
  }
  console.log('instrumentationCheck finish');
};
