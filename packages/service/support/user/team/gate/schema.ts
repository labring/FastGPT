import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { Schema, getMongoModel } from '../../../../common/mongo';
import type { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';

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
  name: {
    type: String
  },
  banner: {
    type: String
  },
  logo: {
    type: String
  },
  tools: {
    type: [String]
  },
  placeholderText: {
    type: String
  }
});

export const MongoTeamGate = getMongoModel<GateSchemaType>(gateCollectionName, GateConfigSchema);
