import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { Schema, getMongoModel } from '../../../common/mongo';
import { GateSchemaType, GateStatus, GateTool } from '@fastgpt/global/support/user/team/gate/type';
import {
  DEFAULT_HOME_CONFIG,
  DEFAULT_COPYRIGHT_CONFIG
} from '@fastgpt/global/support/user/team/gate/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export const gateCollectionName = 'team_gate_configs';

const GateLogoSchema = new Schema({
  logoId: {
    type: String,
    required: true,
    default: () => getNanoid(12)
  },
  ratio: {
    type: String,
    required: true,
    enum: ['4:1', '1:1']
  },
  url: {
    type: String,
    required: true
  }
});

const GateHomeConfigSchema = new Schema({
  status: {
    type: String,
    enum: Object.values(['enabled', 'disabled']),
    default: DEFAULT_HOME_CONFIG.status
  },
  tools: {
    type: [String],
    enum: Object.values(['webSearch', 'deepThinking', 'fileUpload', 'imageUpload', 'voiceInput']),
    default: DEFAULT_HOME_CONFIG.tools
  },
  slogan: {
    type: String,
    default: DEFAULT_HOME_CONFIG.slogan
  },
  placeholderText: {
    type: String,
    default: DEFAULT_HOME_CONFIG.placeholderText
  }
});

const GateCopyrightConfigSchema = new Schema({
  teamName: {
    type: String,
    default: DEFAULT_COPYRIGHT_CONFIG.teamName
  },
  logos: {
    type: [GateLogoSchema],
    default: DEFAULT_COPYRIGHT_CONFIG.logos
  }
});

const TeamGateSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true,
    unique: true
  },
  home: {
    type: GateHomeConfigSchema,
    default: () => ({})
  },
  copyright: {
    type: GateCopyrightConfigSchema,
    default: () => ({})
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

// 创建更新前中间件，自动更新updateTime
TeamGateSchema.pre('findOneAndUpdate', function () {
  this.set({ updateTime: new Date() });
});

try {
  // 添加索引
  TeamGateSchema.index({ teamId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoTeamGate = getMongoModel<GateSchemaType>(gateCollectionName, TeamGateSchema);
