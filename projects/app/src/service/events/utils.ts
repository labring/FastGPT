import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { sendOneInform } from '../support/user/inform/api';
import { lockTrainingDataByTeamId } from '@fastgpt/service/core/dataset/training/controller';
import { InformLevelEnum } from '@fastgpt/global/support/user/inform/constants';

export const checkTeamAiPointsAndLock = async (teamId: string, tmbId: string) => {
  try {
    await checkTeamAIPoints(teamId);
    return true;
  } catch (error: any) {
    if (error === TeamErrEnum.aiPointsNotEnough) {
      // send inform and lock data
      try {
        sendOneInform({
          level: InformLevelEnum.important,
          title: '文本训练任务中止',
          content:
            '该团队账号AI积分不足，文本训练任务中止，重新充值后将会继续。暂停的任务将在 7 天后被删除。',
          tmbId: tmbId
        });
        console.log('余额不足，暂停【向量】生成任务');
        lockTrainingDataByTeamId(teamId);
      } catch (error) {}
    }
    return false;
  }
};
