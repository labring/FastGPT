import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { createChatCompletion } from '@fastgpt/service/core/ai/config';
import { llmCompletionsBodyFormat, parseLLMStreamResponse } from '@fastgpt/service/core/ai/utils';
import { loadRequestMessages } from '@fastgpt/service/core/chat/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { countGptMessagesTokens } from '@fastgpt/service/common/string/tiktoken';
import { createUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { i18nT } from '@fastgpt/web/i18n/utils';

export type TestCodeParams = {
  code: string;
  codeType: string;
  model: string;
  inputs: Array<{ label: string; type: string }>;
  outputs: Array<{ label: string; type: string }>;
};
export type TestCase = {
  id: string;
  name: string;
  inputs: Record<string, any>;
  expectedOutputs: Record<string, any>;
};
export type TestResult = {
  testCase: TestCase;
  passed: boolean;
  actualOutputs?: Record<string, any>;
  error?: string;
};

export type TestCodeResponse = {
  total: number;
  passed: number;
  failed: number;
  successRate: number;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { code, codeType, model, inputs, outputs }: TestCodeParams = req.body;

    const { teamId, tmbId } = await authCert({
      req,
      authToken: true,
      authApiKey: true
    });

    const { testCases, inputTokens, outputTokens } = await generateTestCases({
      code,
      codeType,
      model,
      inputs,
      outputs
    });

    const results = await runAndCompareTests({ code, codeType, testCases });

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      successRate: results.length > 0 ? results.filter((r) => r.passed).length / results.length : 0
    };

    const { totalPoints, modelName } = formatModelChars2Points({
      model,
      inputTokens,
      outputTokens,
      modelType: ModelTypeEnum.llm
    });
    console.log(totalPoints, modelName);

    createUsage({
      teamId,
      tmbId,
      appName: i18nT('common:support.wallet.usage.Code Test'),
      totalPoints,
      source: UsageSourceEnum.code_test,
      list: [
        {
          moduleName: i18nT('common:support.wallet.usage.Code Test'),
          amount: totalPoints,
          model: modelName,
          inputTokens,
          outputTokens
        }
      ]
    });

    return summary;
  } catch (error) {
    console.error('Test code error:', error);
  }
}

async function generateTestCases({
  code,
  codeType,
  model,
  inputs,
  outputs
}: {
  code: string;
  codeType: string;
  model: string;
  inputs: Array<{ label: string; type: string }>;
  outputs: Array<{ label: string; type: string }>;
}): Promise<{ testCases: TestCase[]; inputTokens: number; outputTokens: number }> {
  const languageName = codeType === SandboxCodeTypeEnum.py ? 'Python' : 'JavaScript';

  const inputsDesc = inputs.map((i) => `${i.label}: ${i.type}`).join(', ');
  const outputsDesc = outputs.map((o) => `${o.label}: ${o.type}`).join(', ');

  const prompt = `Analyze the following ${languageName} code and generate 3 common test cases to verify its functionality.

Code:
\`\`\`${languageName.toLowerCase()}
${code}
\`\`\`

Function inputs: ${inputsDesc}
Expected outputs: ${outputsDesc}

Generate exactly 3 typical usage test cases with realistic data. For each test case, carefully analyze the code logic to determine what the actual output should be based on the given inputs.

Return ONLY a valid JSON array. Use only standard JSON values (strings, numbers, booleans, null, objects, arrays). Do NOT use JavaScript expressions.

Example format:
[
  {
    "id": "test1",
    "name": "Test case 1",
    "inputs": {"param1": "example_value", "param2": 10},
    "expectedOutputs": {"result": "calculated_result"}
  },
  {
    "id": "test2", 
    "name": "Test case 2",
    "inputs": {"param1": "another_value", "param2": 20},
    "expectedOutputs": {"result": "another_calculated_result"}
  },
  {
    "id": "test3",
    "name": "Test case 3", 
    "inputs": {"param1": "third_value", "param2": 5},
    "expectedOutputs": {"result": "third_calculated_result"}
  }
]

IMPORTANT: 
- Analyze the code carefully to predict correct outputs
- Use realistic, common input values
- Return exactly 3 test cases`;

  try {
    const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: prompt }];

    const requestMessages = await loadRequestMessages({
      messages,
      useVision: false
    });

    const { response, isStreamResponse } = await createChatCompletion({
      body: llmCompletionsBodyFormat(
        {
          model,
          messages: requestMessages,
          temperature: 0.2,
          max_tokens: 1500,
          stream: false
        },
        model
      )
    });

    const { content, inputTokens, outputTokens } = await (async () => {
      if (isStreamResponse) {
        const { parsePart, getResponseData } = parseLLMStreamResponse();

        for await (const part of response) {
          parsePart({
            part,
            parseThinkTag: false,
            retainDatasetCite: false
          });
        }

        const { content: responseContent, usage } = getResponseData();
        return {
          content: responseContent,
          inputTokens: usage?.prompt_tokens || (await countGptMessagesTokens(requestMessages)),
          outputTokens:
            usage?.completion_tokens ||
            (await countGptMessagesTokens([{ role: 'assistant', content: responseContent }]))
        };
      } else {
        const usage = response.usage;
        const content = response.choices?.[0]?.message?.content || '';
        return {
          content,
          inputTokens: usage?.prompt_tokens || (await countGptMessagesTokens(requestMessages)),
          outputTokens:
            usage?.completion_tokens ||
            (await countGptMessagesTokens([{ role: 'assistant', content: content }]))
        };
      }
    })();

    const jsonMatch = content.match(/\[[\s\S]*?\]/);

    if (jsonMatch) {
      try {
        const testCases = JSON.parse(jsonMatch[0]);
        if (Array.isArray(testCases) && testCases.length >= 1) {
          const validTestCases = testCases.filter(
            (tc) =>
              tc.id &&
              tc.name &&
              tc.inputs &&
              tc.expectedOutputs &&
              typeof tc.inputs === 'object' &&
              typeof tc.expectedOutputs === 'object'
          );

          if (validTestCases.length > 0) {
            return { testCases: validTestCases.slice(0, 3), inputTokens, outputTokens };
          }
        }
      } catch (parseError) {
        console.warn('Failed to parse AI-generated test cases:', parseError);
      }
    }

    return { testCases: [], inputTokens, outputTokens };
  } catch (error) {
    return { testCases: [], inputTokens: 0, outputTokens: 0 };
  }
}

async function runAndCompareTests({
  code,
  codeType,
  testCases
}: {
  code: string;
  codeType: string;
  testCases: TestCase[];
}): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const testCase of testCases) {
    try {
      const actualOutputs = await runInSandbox(code, codeType, testCase.inputs);
      const passed = compareOutputs(testCase.expectedOutputs, actualOutputs);

      results.push({
        testCase,
        passed,
        actualOutputs
      });
    } catch (error) {
      results.push({
        testCase,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

async function runInSandbox(
  code: string,
  codeType: string,
  inputs: Record<string, any>
): Promise<Record<string, any>> {
  if (!process.env.SANDBOX_URL) {
    throw new Error('SANDBOX_URL not configured');
  }

  const url =
    codeType === SandboxCodeTypeEnum.py
      ? `${process.env.SANDBOX_URL}/sandbox/python`
      : `${process.env.SANDBOX_URL}/sandbox/js`;

  const { data } = await axios.post<{
    success: boolean;
    data: { codeReturn: Record<string, any>; log: string };
  }>(url, { code, variables: inputs });

  if (!data.success) {
    throw new Error('Code execution failed in sandbox');
  }

  return data.data.codeReturn;
}

function compareOutputs(expected: Record<string, any>, actual: Record<string, any>): boolean {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];
    if (!deepEqual(expectedValue, actualValue)) {
      return false;
    }
  }
  return true;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => deepEqual(item, b[index]));
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => keysB.includes(key) && deepEqual(a[key], b[key]));
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < Number.EPSILON;
  }

  return false;
}

export default NextAPI(handler);
