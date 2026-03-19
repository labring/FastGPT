import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkills/type';

// Info about a single skill directory discovered inside a deployed package.zip
export type DeployedSkillInfo = {
  id: string; // skill id from Mongo
  name: string; // from SKILL.md frontmatter
  description: string; // from SKILL.md frontmatter
  avatar?: string; // skill avatar
  directory: string; // absolute path in sandbox, e.g. /workspace/projects/my-skill
  skillMdPath: string; // absolute SKILL.md path in sandbox
};

// Sandbox runtime context - shared across the entire agent lifecycle
export type AgentSandboxContext = {
  sandbox: ISandbox;
  providerSandboxId: string;
  sessionId: string;
  skills: AgentSkillSchemaType[];
  deployedSkills: DeployedSkillInfo[];
  workDirectory: string;
  isReady: boolean;
};
