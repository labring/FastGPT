import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { AuthModeType } from '../type';
import { OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import { parseHeaderCert } from '../controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { MongoOpenApi } from '../../openapi/schema';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import {
  OwnerPermissionVal,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';

export async function authOpenApiKeyCrud({
  id,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  id: string;
}): Promise<
  AuthResponseType & {
    openapi: OpenApiSchema;
  }
> {
  const result = await parseHeaderCert(props);
  const { tmbId, teamId } = result;

  const { role, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const { openapi, isOwner, canWrite } = await (async () => {
    const openapi = await MongoOpenApi.findOne({ _id: id, teamId });

    if (!openapi) {
      throw new Error(OpenApiErrEnum.unExist);
    }

    const isOwner = String(openapi.tmbId) === tmbId || role === TeamMemberRoleEnum.owner;
    const canWrite = isOwner || (String(openapi.tmbId) === tmbId && tmbPer.hasWritePer);

    if (per === ReadPermissionVal && !canWrite) {
      return Promise.reject(OpenApiErrEnum.unAuth);
    }
    if (per === WritePermissionVal && !canWrite) {
      return Promise.reject(OpenApiErrEnum.unAuth);
    }
    if (per === OwnerPermissionVal && !isOwner) {
      return Promise.reject(OpenApiErrEnum.unAuth);
    }

    return {
      openapi,
      isOwner,
      canWrite
    };
  })();

  return {
    ...result,
    openapi,
    isOwner,
    canWrite
  };
}
