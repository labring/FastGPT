import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { AuthModeType } from '../type';
import { parseHeaderCert } from '../controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoTool } from '../../../core/tool/schema';
import { ToolErrEnum } from '@fastgpt/global/common/error/code/tool';
import { ToolItemSchema } from '@fastgpt/global/core/tool/type';
import { splitCombinePluginId } from '../../../core/tool/controller';
import { ToolSourceEnum } from '@fastgpt/global/core/tool/constants';

export async function authToolCrud({
  id,
  per = 'owner',
  ...props
}: AuthModeType & {
  id: string;
}): Promise<
  AuthResponseType & {
    plugin: ToolItemSchema;
  }
> {
  const result = await parseHeaderCert(props);
  const { tmbId, teamId } = result;

  const { role } = await getTmbInfoByTmbId({ tmbId });

  const { plugin, isOwner, canWrite } = await (async () => {
    const plugin = await MongoTool.findOne({ _id: id, teamId });

    if (!plugin) {
      throw new Error(ToolErrEnum.unExist);
    }

    const isOwner = String(plugin.tmbId) === tmbId || role === TeamMemberRoleEnum.owner;
    const canWrite = isOwner;

    if (per === 'w' && !canWrite) {
      return Promise.reject(ToolErrEnum.unAuth);
    }
    if (per === 'owner' && !isOwner) {
      return Promise.reject(ToolErrEnum.unAuth);
    }

    return {
      plugin,
      isOwner,
      canWrite
    };
  })();

  return {
    ...result,
    plugin,
    isOwner,
    canWrite
  };
}

export async function authPluginCanUse({
  id,
  teamId,
  tmbId
}: {
  id: string;
  teamId: string;
  tmbId: string;
}) {
  const { source, pluginId } = await splitCombinePluginId(id);

  if (source === ToolSourceEnum.community) {
    return true;
  }

  if (source === ToolSourceEnum.personal) {
    const { role } = await getTmbInfoByTmbId({ tmbId });
    const plugin = await MongoTool.findOne({ _id: pluginId, teamId });
    if (!plugin) {
      return Promise.reject(ToolErrEnum.unExist);
    }
  }

  return true;
}
