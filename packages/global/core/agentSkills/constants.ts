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
  { label: string; icon: string }
> = {
  [AgentSkillCategoryEnum.search]: {
    label: '搜索',
    icon: 'core/agentSkill/search'
  },
  [AgentSkillCategoryEnum.tool]: {
    label: '工具',
    icon: 'core/agentSkill/tool'
  },
  [AgentSkillCategoryEnum.coding]: {
    label: '编程',
    icon: 'core/agentSkill/coding'
  },
  [AgentSkillCategoryEnum.data]: {
    label: '数据处理',
    icon: 'core/agentSkill/data'
  },
  [AgentSkillCategoryEnum.analysis]: {
    label: '分析',
    icon: 'core/agentSkill/analysis'
  },
  [AgentSkillCategoryEnum.communication]: {
    label: '通信',
    icon: 'core/agentSkill/communication'
  },
  [AgentSkillCategoryEnum.other]: {
    label: '其他',
    icon: 'core/agentSkill/other'
  }
};

export const agentSkillsCollectionName = 'agent_skills';

export const agentSkillsVersionCollectionName = 'agent_skills_versions';

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

// Sandbox instance lifecycle status (running/stopped)
export enum SandboxStatusEnum {
  running = 'running',
  stopped = 'stopped'
}

export const sandboxInstanceCollectionName = 'agent_sandbox_instances';
