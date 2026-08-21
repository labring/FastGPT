import type { AgentLoopProvider } from '../../domain';
import { runPiAgentLoop } from './run';

/** pi-agent-core provider 的唯一聚合入口，registry 不感知其内部模块。 */
export const piAgentProvider: AgentLoopProvider = {
  name: 'piAgent',
  run: runPiAgentLoop
};
