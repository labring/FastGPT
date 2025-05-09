import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { Schema, getMongoModel } from '../../common/mongo';
import { type McpKeyType } from '@fastgpt/global/support/mcp/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { AppCollectionName } from '../../core/app/schema';

export const mcpCollectionName = 'mcp_keys';

const McpKeySchema = new Schema({
  name: {
    type: String,
    required: true
  },
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
    type: [
      {
        appId: {
          type: Schema.Types.ObjectId,
          ref: AppCollectionName,
          required: true
        },
        appName: String,
        toolName: {
          type: String,
          required: true
        },
        description: {
          type: String,
          required: true
        }
      }
    ],
    default: []
  }
});

try {
} catch (error) {
  console.log(error);
}

export const MongoMcpKey = getMongoModel<McpKeyType>(mcpCollectionName, McpKeySchema);
