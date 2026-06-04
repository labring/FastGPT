import { createAskAgentTool } from './tool';
export * from './parser';
export { AgentAskPayloadSchema, type AgentAskPayload } from './tool';

export const askUserToolName = 'ask_user';

export const createAskUserAgentTool = () => createAskAgentTool(askUserToolName);
