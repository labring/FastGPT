import type { ISandbox } from '@anyany/sandbox_provider';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkill/type';

// Sandbox runtime context - shared across the entire agent lifecycle
export type AgentSandboxContext = {
  sandbox: ISandbox;
  providerSandboxId: string;
  // 与 sync agent SESSION_ID 对应的会话 key，决定 MinIO 数据路径
  sessionId: string;
  skills: AgentSkillSchemaType[];
  workDirectory: string;
  isReady: boolean;
};
