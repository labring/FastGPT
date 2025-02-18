import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemInfo } from '@fastgpt/service/common/system/info/schema';
import { compareVersion } from '@fastgpt/service/common/system/initScripts';
import { runInitScript } from '@fastgpt/service/common/system/info/controllers';
export type UpdateQuery = {
  version: string; // 升级到哪个版本
};
export type UpdateBody = {};
export type UpdateResponse = {};
async function handler(
  req: ApiRequestProps<UpdateBody, UpdateQuery>,
  _res: ApiResponseType<any>
): Promise<UpdateResponse> {
  const { version } = req.query;
  const systemInfo = await MongoSystemInfo.findOne();
  if (!systemInfo) {
    return Promise.reject(new Error('systemInfo not found'));
  }
  if (compareVersion(systemInfo.version, version) < 0) {
    return Promise.reject(new Error('version is lower than current version'));
  }

  await MongoSystemInfo.updateOne(
    {
      _id: systemInfo._id
    },
    {
      $set: {
        version,
        updateTime: new Date(),
        lock: false
      }
    }
  );

  await runInitScript();
  return {};
}
export default NextAPI(handler);
