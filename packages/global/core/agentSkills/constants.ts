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
