import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import {
  agentSkillsCollectionName,
  AgentSkillSourceEnum,
  AgentSkillCategoryEnum,
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';

/**
 * Agent Skill 主表模型类型。
 *
 * creationPayload 只用于 AI 辅助创建阶段保存临时生成上下文，不属于发布后的
 * SKILL.md 运行时元数据，因此只在 service 层模型里补充。
 */
export type MongoAgentSkillSchemaType = AgentSkillSchemaType & {
  creationPayload?: {
    requirements?: string;
    model?: string;
  };
};

const { Schema } = connectionMongo;

/**
 * Agent Skill 主表结构。
 *
 * Skill 与 Folder 共用一张表：type 区分节点类型，parentId 表达目录层级；
 * 版本字段只记录当前激活版本与对象存储位置，历史版本明细由 version 模块维护。
 */
const AgentSkillsSchema = new Schema({
  // 文件夹层级：folder 和 skill 都通过 parentId 组织在同一棵树里。
  parentId: {
    type: Schema.Types.ObjectId,
    ref: agentSkillsCollectionName,
    default: null
  },
  type: {
    type: String,
    enum: Object.values(AgentSkillTypeEnum),
    default: AgentSkillTypeEnum.skill
  },
  // 权限继承：文件夹节点可向下继承，skill 节点读取权限时会结合权限模块处理。
  inheritPermission: {
    type: Boolean,
    default: true
  },
  source: {
    type: String,
    enum: Object.values(AgentSkillSourceEnum),
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  author: {
    type: String,
    default: ''
  },
  category: {
    type: [String],
    enum: Object.values(AgentSkillCategoryEnum),
    default: []
  },
  config: {
    type: Object,
    default: {}
  },
  avatar: {
    type: String
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'team'
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: 'team_members'
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  deleteTime: {
    type: Date,
    default: null
  },
  // 当前激活版本快照；完整版本列表与状态流转在 version 模块中维护。
  currentVersion: {
    type: Number,
    default: 0
  },
  versionCount: {
    type: Number,
    default: 0
  },
  currentStorage: {
    bucket: String,
    key: String,
    size: Number
  },
  creationStatus: {
    type: String,
    enum: Object.values(AgentSkillCreationStatusEnum),
    default: AgentSkillCreationStatusEnum.ready
  },
  creationError: {
    type: String
  },
  creationPayload: {
    requirements: String,
    model: String
  }
});

try {
  // 名称和描述用于列表页搜索。
  AgentSkillsSchema.index({ name: 'text', description: 'text' });
  // 列表页按来源、团队、删除状态和创建时间过滤排序。
  AgentSkillsSchema.index({ source: 1, teamId: 1, deleteTime: 1, createTime: -1 });
  // 分类筛选。
  AgentSkillsSchema.index({ category: 1 });
  // 文件夹树查询。
  AgentSkillsSchema.index({ parentId: 1, teamId: 1, deleteTime: 1 });
  // 同一父目录下的个人 skill/folder 不允许重名，软删除数据不参与唯一约束。
  AgentSkillsSchema.index(
    { parentId: 1, name: 1, teamId: 1, deleteTime: 1 },
    {
      unique: true,
      partialFilterExpression: { deleteTime: null, source: AgentSkillSourceEnum.personal }
    }
  );
} catch (error) {
  console.log('AgentSkill index error:', error);
}

export const MongoAgentSkills = getMongoModel<MongoAgentSkillSchemaType>(
  agentSkillsCollectionName,
  AgentSkillsSchema
);
