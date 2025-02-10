import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import {
  getWorkflowEntryNodeIds,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
vi.mock(import('@fastgpt/service/common/string/tiktoken'), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    countGptMessagesTokens: async () => {
      return 1;
    }
  };
});

vi.mock(import('@fastgpt/service/support/wallet/usage/utils'), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    formatModelChars2Points: () => ({
      modelName: 'test',
      totalPoints: 1
    })
  };
});

const testWorkflow = async (path: string) => {
  const workflowStr = readFileSync(resolve(path), 'utf-8');
  const workflow = JSON.parse(workflowStr);
  const { nodes, edges, chatConfig } = workflow;
  let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes));
  const variables = {};
  const { assistantResponses, flowResponses } = await dispatchWorkFlow({
    mode: 'test',
    runningAppInfo: {
      id: 'test',
      teamId: 'test',
      tmbId: 'test'
    },
    runningUserInfo: {
      tmbId: 'test',
      teamId: 'test'
    },
    timezone: 'Asia/Shanghai',
    externalProvider: {},
    uid: 'test',
    runtimeNodes,
    runtimeEdges: edges,
    variables,
    query: [
      {
        type: ChatItemValueTypeEnum.text,
        text: {
          content: '你是谁'
        }
      }
    ],
    chatConfig,
    histories: [],
    stream: false,
    maxRunTimes: 5
  });
  expect(assistantResponses).toBeDefined();
  expect(assistantResponses[0].text?.content).toBeDefined();
  return {
    assistantResponses,
    flowResponses
  };
};

it('Workflow test: simple workflow', async () => {
  // create a simple app
  await testWorkflow('projects/app/src/test/workflow/simple.json');
});

it('Workflow test: output test', async () => {
  console.log(await testWorkflow('projects/app/src/test/workflow/loopTest.json'));
});
