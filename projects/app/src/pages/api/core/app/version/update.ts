import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateAppVersionBodySchema,
  UpdateAppVersionResponseSchema,
  type UpdateAppVersionBodyType,
  type UpdateAppVersionResponseType
} from '@fastgpt/global/openapi/core/app/version/api';

async function handler(
  req: ApiRequestProps<UpdateAppVersionBodyType>
): Promise<UpdateAppVersionResponseType> {
  const { appId, versionId, versionName } = parseApiInput({
    req,
    bodySchema: UpdateAppVersionBodySchema
  }).body;
  await authApp({ appId, req, per: WritePermissionVal, authToken: true });

  await MongoAppVersion.updateOne({ _id: versionId, appId }, { $set: { versionName } });

  return UpdateAppVersionResponseSchema.parse(undefined);
}

export default NextAPI(handler);
