import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;

export const AppQGuideCollectionName = 'app_question_guides';

type AppQGuideSchemaType = {
  _id: string;
  appId: string;
  teamId: string;
  text: string;
};

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
    type: String,
    default: ''
  }
});

try {
  AppQGuideSchema.index({ appId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoAppQGuide: Model<AppQGuideSchemaType> =
  models[AppQGuideCollectionName] || model(AppQGuideCollectionName, AppQGuideSchema);

MongoAppQGuide.syncIndexes();
