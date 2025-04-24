import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { Schema, getMongoModel } from '../../../../common/mongo';
import { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';

export const gateCollectionName = 'team_gate_config';

const GateConfigSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName
  },
  status: {
    type: Boolean,
    default: false
  },
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

export const MongoTeamGate = getMongoModel<GateSchemaType>(gateCollectionName, GateConfigSchema);
