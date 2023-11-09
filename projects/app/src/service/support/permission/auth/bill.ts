import { GET } from '@fastgpt/service/common/api/plusRequest';

export const authTeamBalance = async (teamId: string) => {
  if (global.systemEnv.pluginBaseUrl) {
    return GET('/support/permission/authBalance', { teamId });
  }
  return true;
};
