import { delay } from '@fastgpt/global/common/system/utils';
import { MongoDatasetTraining } from './schema';

export const lockTrainingDataByTeamId = async (teamId: string, retry = 3): Promise<any> => {
  try {
    await MongoDatasetTraining.updateMany(
      {
        teamId
      },
      {
        lockTime: new Date('2999/5/5')
      }
    );
  } catch (error) {
    if (retry > 0) {
      await delay(1000);
      return lockTrainingDataByTeamId(teamId, retry - 1);
    }
    return Promise.reject(error);
  }
};
