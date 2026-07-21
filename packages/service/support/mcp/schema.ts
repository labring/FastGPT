import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { defineIndex, Schema, getMongoModel } from '../../common/mongo';
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

defineIndex(McpKeySchema, {
  key: { key: 1 },
  options: { unique: true }
});

export const MongoMcpKey = getMongoModel<McpKeyType>(mcpCollectionName, McpKeySchema);
