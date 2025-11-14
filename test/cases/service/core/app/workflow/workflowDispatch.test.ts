import { readFileSync } from 'fs';
import { resolve } from 'path';
import { it, expect, vi } from 'vitest';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import {
  getWorkflowEntryNodeIds,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

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
  const fileContent = readFileSync(resolve(process.cwd(), path), 'utf-8');
  const workflow = JSON.parse(fileContent);
  console.log(workflow, 111);
  const { nodes, edges, chatConfig } = workflow;
  let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes));
  const variables = {};
  const { assistantResponses, flowResponses } = await dispatchWorkFlow({
    mode: 'test',
    usageSource: UsageSourceEnum.fastgpt,
    runningAppInfo: {
      id: 'test',
      name: 'test',
      teamId: 'test',
      tmbId: 'test'
    },
    runningUserInfo: {
      tmbId: 'test',
      teamId: 'test',
      username: 'test',
      teamName: 'test',
      memberName: 'test',
      contact: 'test'
    },
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
  // await testWorkflow('test/cases/service/core/app/workflow/loopTest.json');
});

it('Workflow test: output test', async () => {
  // console.log(await testWorkflow('@/test/cases/workflow/loopTest.json'));
});
