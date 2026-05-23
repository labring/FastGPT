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

export const agentSkillsCollectionName = 'agent_skills';

export const agentSkillsVersionCollectionName = 'agent_skills_versions';

export enum AgentSkillCreationStatusEnum {
  creating = 'creating',
  ready = 'ready',
  failed = 'failed'
}

// Agent Skill types
export enum AgentSkillTypeEnum {
  folder = 'folder',
  skill = 'skill'
}
// Sandbox types
export enum SandboxTypeEnum {
  editDebug = 'edit-debug',
  sessionRuntime = 'session-runtime'
}
