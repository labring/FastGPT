import type { Agent } from 'http';
import type { PromptLoader } from '@fastgpt/service/core/ai/config/utils';
declare global {
  var httpsAgent: Agent;
  var promptLoader: PromptLoader;
}
