import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { sendOneInform } from '../support/user/inform/api';
import { lockTrainingDataByTeamId } from '@fastgpt/service/core/dataset/training/controller';
import { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getErrText } from '@fastgpt/global/common/error/utils';

export const checkTeamAiPointsAndLock = async (teamId: string, tmbId: string) => {
  try {
    await checkTeamAIPoints(teamId);
    return true;
  } catch (error: any) {
    if (error === TeamErrEnum.aiPointsNotEnough) {
      // send inform and lock data
      try {
        sendOneInform({
          type: 'system',
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

export const checkInvalidChunkAndLock = async ({
  err,
  errText,
  data
}: {
  err: any;
  errText: string;
  data: DatasetTrainingSchemaType;
}) => {
  if (err?.response) {
    addLog.info(`openai error: ${errText}`, {
      status: err.response?.status,
      stateusText: err.response?.statusText,
      data: err.response?.data
    });
  } else {
    console.log(err);
    addLog.error(getErrText(err, errText));
  }

  if (
    err?.message === 'invalid message format' ||
    err?.type === 'invalid_request_error' ||
    err?.code === 500
  ) {
    addLog.info('Lock training data');
    console.log(err);

    try {
      await MongoDatasetTraining.findByIdAndUpdate(data._id, {
        lockTime: new Date('2998/5/5')
      });
    } catch (error) {}
    return true;
  }
  return false;
};
