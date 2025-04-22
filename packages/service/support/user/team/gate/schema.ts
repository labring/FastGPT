import { Schema, getMongoModel } from '../../../../common/mongo';
import { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';

export const gateCollectionName = 'team_gate_configs';

const GateHomeConfigSchema = new Schema({
  tools: {
    type: [String],
    enum: Object.values(['webSearch', 'deepThinking', 'fileUpload', 'imageUpload', 'voiceInput'])
  },
  slogan: {
    type: String
  },
  placeholderText: {
    type: String
  }
});

export const MongoTeamGate = getMongoModel<GateSchemaType>(
  gateCollectionName,
  GateHomeConfigSchema
);
