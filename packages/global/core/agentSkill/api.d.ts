import type { AgentSkillCategoryEnum, AgentSkillSourceEnum } from './constants';
import type { AgentSkillConfigType, ExtractedSkillPackage } from './type';

// ==================== List Skills ====================
export type ListSkillsQuery = {
  source?: 'store' | 'mine'; // store = system skills, mine = personal skills
  searchKey?: string;
  category?: `${AgentSkillCategoryEnum}`;
  page?: number;
  pageSize?: number;
};

export type ListSkillsResponse = {
  list: {
    _id: string;
    source: `${AgentSkillSourceEnum}`;
    name: string;
    description: string;
    author: string;
    category: `${AgentSkillCategoryEnum}`[];
    avatar?: string;
    createTime: string;
    updateTime: string;
  }[];
  total: number;
};

// ==================== Create Skill ====================
export type CreateSkillBody = {
  name: string;
  description: string;
  markdown: string;
  category?: `${AgentSkillCategoryEnum}`[];
  config?: AgentSkillConfigType;
  avatar?: string;
};

export type CreateSkillResponse = string; // skillId

// ==================== Update Skill ====================
export type UpdateSkillBody = {
  skillId: string;
  name?: string;
  description?: string;
  markdown?: string;
  category?: `${AgentSkillCategoryEnum}`[];
  config?: AgentSkillConfigType;
  avatar?: string;
};

export type UpdateSkillResponse = void;

// ==================== Delete Skill ====================
export type DeleteSkillQuery = {
  skillId: string;
};

export type DeleteSkillResponse = void;

// ==================== Get Skill Detail ====================
export type GetSkillDetailQuery = {
  skillId: string;
};

export type GetSkillDetailResponse = {
  _id: string;
  source: `${AgentSkillSourceEnum}`;
  name: string;
  description: string;
  markdown: string;
  author: string;
  category: `${AgentSkillCategoryEnum}`[];
  config: AgentSkillConfigType;
  avatar?: string;
  teamId?: string;
  tmbId?: string;
  createTime: string;
  updateTime: string;
};

// ==================== Import Skill ====================
export type ImportSkillBody = {
  // FormData with file and optional data
};

export type ImportSkillResponse = string; // skillId
