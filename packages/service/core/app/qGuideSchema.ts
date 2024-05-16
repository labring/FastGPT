import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { AppQuestionGuideTextConfigType } from '@fastgpt/global/core/app/type';

export const AppQGuideCollectionName = 'app_question_guides';

const AppQGuideSchema = new Schema({
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppQGuideCollectionName,
    required: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  text: {
    type: Array,
    default: []
  }
});

try {
  AppQGuideSchema.index({ appId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoAppQGuide: Model<AppQuestionGuideTextConfigType> =
  models[AppQGuideCollectionName] || model(AppQGuideCollectionName, AppQGuideSchema);

MongoAppQGuide.syncIndexes();
