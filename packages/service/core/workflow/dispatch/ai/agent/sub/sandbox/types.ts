import type { ISandbox } from '@anyany/sandbox_provider';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkill/type';

// Sandbox runtime context - shared across the entire agent lifecycle
export type AgentSandboxContext = {
  sandbox: ISandbox;
  providerSandboxId: string;
  skills: AgentSkillSchemaType[];
  workDirectory: string;
  isReady: boolean;
};
