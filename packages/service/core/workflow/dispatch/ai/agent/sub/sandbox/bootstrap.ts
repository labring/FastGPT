import type { AgentSandboxBootstrap } from './runtime';

/**
 * 平台侧 Agent sandbox bootstrap 回调。
 *
 * 回调会在 per-sandbox Redis lease 内执行，且早于用户文件注入、skill 包部署和
 * sandbox entrypoint。需要配置镜像源、写平台内置文件或做其他基础环境准备时，直接把
 * 这里的 undefined 替换成 async 回调；回调内部自行维护幂等、版本判断和错误处理。
 *
 * 示例：
 * export const agentSandboxBootstrap: AgentSandboxBootstrap = async ({ sandbox, workDirectory }) => {
 *   await sandbox.writeFiles([{ path: '.npmrc', data: 'registry=https://registry.npmmirror.com' }]);
 *   await sandbox.execute(`cd ${workDirectory} && ...`);
 * };
 */
export const agentSandboxBootstrap: AgentSandboxBootstrap | undefined = undefined;
