import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { AuthModeType } from '../type';
import { parseHeaderCert } from '../controller';
import { getTeamInfoByTmbId } from '../../user/team/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoPlugin } from '../../../core/plugin/schema';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { PluginItemSchema } from '@fastgpt/global/core/plugin/type';

export async function authPluginCrud({
  id,
  per = 'owner',
  ...props
}: AuthModeType & {
  id: string;
}): Promise<
  AuthResponseType & {
    plugin: PluginItemSchema;
  }
> {
  const result = await parseHeaderCert(props);
  const { tmbId, teamId } = result;

  const { role } = await getTeamInfoByTmbId({ tmbId });

  const { plugin, isOwner, canWrite } = await (async () => {
    const plugin = await MongoPlugin.findOne({ _id: id, teamId });

    if (!plugin) {
      throw new Error(PluginErrEnum.unExist);
    }

    const isOwner = String(plugin.tmbId) === tmbId || role === TeamMemberRoleEnum.owner;
    const canWrite = isOwner;

    if (per === 'w' && !canWrite) {
      return Promise.reject(PluginErrEnum.unAuth);
    }
    if (per === 'owner' && !isOwner) {
      return Promise.reject(PluginErrEnum.unAuth);
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
