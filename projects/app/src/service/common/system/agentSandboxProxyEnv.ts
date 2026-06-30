import {
  getAgentSandboxMissingProxyRequiredEnvKeys,
  type AgentSandboxEnvSource
} from '@fastgpt/global/core/ai/sandbox/env';

/**
 * 校验 FastGPT app 浏览器直连 agent-sandbox-proxy 所需环境变量。
 * 该能力只属于主站 app 的 sandbox editor/proxy 链路，不能放在共享 serviceEnv 中校验，
 * 否则 pro/admin 等只复用服务端能力的项目会被不必要的 proxy 配置阻塞。
 */
export const validateAgentSandboxProxyEnv = (env: AgentSandboxEnvSource = process.env): void => {
  const missingAgentSandboxProxyEnvKeys = getAgentSandboxMissingProxyRequiredEnvKeys(env);
  if (missingAgentSandboxProxyEnvKeys.length === 0) {
    return;
  }

  throw new Error(
    `Invalid Agent Sandbox proxy environment variables: ${missingAgentSandboxProxyEnvKeys.join(
      ', '
    )} are required when AGENT_SANDBOX_PROVIDER is ${env.AGENT_SANDBOX_PROVIDER}.`
  );
};
