import { createAskAgentTool } from './tool';
export * from './parser';

export const askUserToolName = 'ask_user';

export const createAskUserAgentTool = () => createAskAgentTool(askUserToolName);
