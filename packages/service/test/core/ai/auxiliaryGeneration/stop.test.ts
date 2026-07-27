import { beforeEach, describe, expect, it } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  clearAuxiliaryGenerationStop,
  shouldAuxiliaryGenerationStop
} from '@fastgpt/service/core/ai/auxiliaryGeneration/stop';
import {
  delAgentRuntimeStopSign,
  setAgentRuntimeStop,
  shouldWorkflowStop
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';

const params = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'auxiliary-app-1',
  chatId: 'auxiliary-chat-1'
};

describe('auxiliary generation stop signal', () => {
  beforeEach(async () => {
    await delAgentRuntimeStopSign(params);
  });

  it('shares the workflow stop signal key', async () => {
    await setAgentRuntimeStop(params);

    await expect(shouldAuxiliaryGenerationStop(params)).resolves.toBe(true);
    await expect(shouldWorkflowStop(params)).resolves.toBe(true);
  });

  it('clears the shared signal for workflow completion', async () => {
    await setAgentRuntimeStop(params);

    await clearAuxiliaryGenerationStop(params);

    await expect(shouldAuxiliaryGenerationStop(params)).resolves.toBe(false);
    await expect(shouldWorkflowStop(params)).resolves.toBe(false);
  });
});
