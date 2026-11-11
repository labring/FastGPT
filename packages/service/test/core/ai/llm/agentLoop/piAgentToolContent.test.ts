import { describe, expect, it, vi } from 'vitest';
import { buildPiAgentTools } from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/tool/build';

const createRuntime = ({
  useVision = true,
  executeTool = vi.fn()
}: {
  useVision?: boolean;
  executeTool?: ReturnType<typeof vi.fn>;
}) =>
  ({
    llmParams: {
      useVision,
      model: { config: { vision: useVision } }
    },
    toolCatalog: {
      runtimeTools: [
        {
          type: 'function',
          function: {
            name: 'get_task',
            description: 'get task detail',
            parameters: { type: 'object', properties: {} }
          }
        }
      ]
    },
    executeTool,
    emitEvent: vi.fn(),
    usagePush: vi.fn()
  }) as any;

const buildTools = (runtime: any) =>
  buildPiAgentTools({
    runtime,
    getActivePlan: () => undefined,
    setActivePlan: vi.fn(),
    setPendingAsk: vi.fn(),
    getMessages: () => [],
    onToolCall: vi.fn(),
    onToolResult: vi.fn()
  });

describe('piAgent tool content composition', () => {
  it('keeps the business response text when the tool returns an image part', async () => {
    const response = '{"jobId":"task-123"}';
    const executeTool = vi.fn(async () => ({
      response,
      content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
      assistantMessages: [],
      usages: [],
      stop: false
    }));

    const tools = await buildTools(createRuntime({ executeTool }));
    const tool = tools.find((item) => item.name === 'get_task');
    const result: any = await tool!.execute('call_1', {});

    // jobId 这类业务字段必须继续发给模型，图片只作为附加 part。
    expect(result.content).toEqual([
      { type: 'text', text: response },
      { type: 'image', mimeType: 'image/png', data: 'AAAA' }
    ]);
  });

  it('degrades the image part to text when the model has no vision', async () => {
    const response = '{"jobId":"task-123"}';
    const executeTool = vi.fn(async () => ({
      response,
      content: [{ type: 'image_url', image_url: { url: 'https://files.example.com/chart.png' } }],
      assistantMessages: [],
      usages: [],
      stop: false
    }));

    const tools = await buildTools(createRuntime({ useVision: false, executeTool }));
    const tool = tools.find((item) => item.name === 'get_task');
    const result: any = await tool!.execute('call_1', {});

    expect(result.content).toEqual([
      { type: 'text', text: response },
      { type: 'text', text: '[Image: https://files.example.com/chart.png]' }
    ]);
  });
});
