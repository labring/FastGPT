import { createAgentLoopCoreSystemTools } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/runtime/systemTools';
import { describe, expect, it, vi } from 'vitest';

describe('createAgentLoopCoreSystemTools', () => {
  it('creates control system tools and omits missing optional tools', () => {
    expect(
      createAgentLoopCoreSystemTools({
        planEnabled: true,
        askEnabled: false
      })
    ).toEqual({
      plan: {
        enabled: true
      },
      ask: {
        enabled: false
      }
    });
  });

  it('attaches sandbox, read file and dataset search executors when provided', async () => {
    const sandboxClient = {} as any;
    const readFileExecute = vi.fn().mockResolvedValue({ response: 'file content' });
    const datasetSearchExecute = vi.fn().mockResolvedValue({ response: 'search content' });

    const tools = createAgentLoopCoreSystemTools({
      planEnabled: false,
      askEnabled: false,
      sandboxClient,
      readFile: {
        enabled: true,
        maxFileAmount: 6,
        execute: readFileExecute as any
      },
      datasetSearch: {
        enabled: true,
        execute: datasetSearchExecute as any,
        currentInputFiles: ['https://files/a.png']
      }
    });

    expect(tools).toEqual({
      plan: {
        enabled: false
      },
      ask: {
        enabled: false
      },
      sandbox: {
        enabled: true,
        client: sandboxClient
      },
      readFile: {
        enabled: true,
        maxFileAmount: 6,
        execute: expect.any(Function)
      },
      datasetSearch: {
        enabled: true,
        execute: expect.any(Function),
        currentInputFiles: ['https://files/a.png']
      }
    });

    const sampleCall = {
      call: {
        id: 'call_1',
        type: 'function' as const,
        function: { name: 'tool', arguments: '{}' }
      },
      messages: []
    };

    await tools.readFile?.execute(sampleCall);
    expect(readFileExecute).toHaveBeenCalledWith(sampleCall);

    await tools.datasetSearch?.execute(sampleCall);
    expect(datasetSearchExecute).toHaveBeenCalledWith(sampleCall);
  });
});
