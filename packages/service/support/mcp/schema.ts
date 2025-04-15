import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { Schema, getMongoModel } from '../../common/mongo';
import { McpKeyType } from '@fastgpt/global/support/mcp/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export const mcpCollectionName = 'mcp_keys';

const McpKeySchema = new Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: () => getNanoid(24)
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  apps: {
    type: [Object],
    default: []
  }
});

try {
} catch (error) {
  console.log(error);
}

export const MongoMcpKey = getMongoModel<McpKeyType>(mcpCollectionName, McpKeySchema);
