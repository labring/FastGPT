import { GET } from '@fastgpt/service/common/api/plusRequest';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

export const authTeamBalance = async (teamId: string) => {
  if (FastGPTProUrl) {
    return GET('/support/permission/authBalance', { teamId });
  }
  return true;
};
