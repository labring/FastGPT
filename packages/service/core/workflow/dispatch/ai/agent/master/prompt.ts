import { SubAppIds } from '../sub/constants';

export const MasterSystemPrompt = `当用户的任务较为复杂，并且需要多轮运行时，执行工具：${SubAppIds.plan}。
或者当用户的提示词里有明确流程时，也可以通过 ${SubAppIds.plan} 生成实施步骤。`;
