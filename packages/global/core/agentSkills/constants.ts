import type { I18nStringType } from '../../common/i18n/type';

export enum AgentSkillSourceEnum {
  system = 'system',
  personal = 'personal'
}

export enum AgentSkillCategoryEnum {
  search = 'search',
  tool = 'tool',
  coding = 'coding',
  data = 'data',
  analysis = 'analysis',
  communication = 'communication',
  other = 'other'
}

export const AgentSkillCategoryMap: Record<
  `${AgentSkillCategoryEnum}`,
  { label: I18nStringType; icon: string }
> = {
  [AgentSkillCategoryEnum.search]: {
    label: {
      'zh-CN': '搜索',
      'zh-Hant': '搜索',
      en: 'Search'
    },
    icon: 'core/agentSkill/search'
  },
  [AgentSkillCategoryEnum.tool]: {
    label: {
      'zh-CN': '工具',
      'zh-Hant': '工具',
      en: 'Tool'
    },
    icon: 'core/agentSkill/tool'
  },
  [AgentSkillCategoryEnum.coding]: {
    label: {
      'zh-CN': '编程',
      'zh-Hant': '編程',
      en: 'Coding'
    },
    icon: 'core/agentSkill/coding'
  },
  [AgentSkillCategoryEnum.data]: {
    label: {
      'zh-CN': '数据处理',
      'zh-Hant': '數據處理',
      en: 'Data Processing'
    },
    icon: 'core/agentSkill/data'
  },
  [AgentSkillCategoryEnum.analysis]: {
    label: {
      'zh-CN': '分析',
      'zh-Hant': '分析',
      en: 'Analysis'
    },
    icon: 'core/agentSkill/analysis'
  },
  [AgentSkillCategoryEnum.communication]: {
    label: {
      'zh-CN': '通信',
      'zh-Hant': '通訊',
      en: 'Communication'
    },
    icon: 'core/agentSkill/communication'
  },
  [AgentSkillCategoryEnum.other]: {
    label: {
      'zh-CN': '其他',
      'zh-Hant': '其他',
      en: 'Other'
    },
    icon: 'core/agentSkill/other'
  }
};

export const agentSkillsCollectionName = 'agent_skills';

export const agentSkillsVersionCollectionName = 'agent_skills_versions';

export const skillSandboxCollectionName = 'skill_sandbox_info';

// Agent Skill types
export enum AgentSkillTypeEnum {
  folder = 'folder',
  skill = 'skill'
}

export const AgentSkillFolderTypeList = [AgentSkillTypeEnum.folder];

// Sandbox types
export enum SandboxTypeEnum {
  editDebug = 'edit-debug',
  sessionRuntime = 'session-runtime'
}

// Sandbox status states
export enum SandboxStateEnum {
  pending = 'Pending',
  running = 'Running',
  failed = 'Failed',
  succeeded = 'Succeeded',
  unknown = 'Unknown'
}

// Sandbox protocol types
export enum SandboxProtocolEnum {
  http = 'http',
  https = 'https'
}

export const sandboxInstanceCollectionName = 'agent_sandbox_instances';
