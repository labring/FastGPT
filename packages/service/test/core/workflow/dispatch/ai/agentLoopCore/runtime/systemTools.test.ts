import { createAgentLoopCoreSystemTools } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
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

  it('attaches sandbox, read file and dataset search executors when provided', () => {
    const sandboxClient = {} as any;
    const readFileExecute = vi.fn();
    const datasetSearchExecute = vi.fn();

    expect(
      createAgentLoopCoreSystemTools({
        planEnabled: false,
        askEnabled: false,
        sandboxClient,
        readFile: {
          enabled: true,
          execute: readFileExecute as any
        },
        datasetSearch: {
          enabled: true,
          execute: datasetSearchExecute as any,
          currentInputFiles: ['https://files/a.png']
        }
      })
    ).toEqual({
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
        execute: readFileExecute
      },
      datasetSearch: {
        enabled: true,
        execute: datasetSearchExecute,
        currentInputFiles: ['https://files/a.png']
      }
    });
  });
});
