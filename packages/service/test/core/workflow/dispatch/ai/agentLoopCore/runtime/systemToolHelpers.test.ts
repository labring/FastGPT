import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  buildAgentLoopCoreSystemToolFileUrl,
  createAgentLoopCoreReadFileExecutor,
  mergeAgentLoopCoreSystemToolNodeResponse,
  normalizeAgentLoopCoreDatasetSearchResult,
  parseAgentLoopCoreReadFileCall,
  sumAgentLoopCoreUsagePoints
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
import { describe, expect, it, vi } from 'vitest';

describe('agentLoopCore system tool helpers', () => {
  it('parses read file ids from tool call arguments', () => {
    expect(
      parseAgentLoopCoreReadFileCall({
        function: {
          arguments: JSON.stringify({
            ids: ['file-1', 'file-2']
          })
        }
      })
    ).toEqual({
      success: true,
      ids: ['file-1', 'file-2']
    });
  });

  it('returns a stable error response for invalid read file arguments', () => {
    const result = parseAgentLoopCoreReadFileCall({
      function: {
        arguments: JSON.stringify({
          ids: 'file-1'
        })
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.usages).toEqual([]);
      expect(result.response).toContain('ids');
      expect(result.response.toLowerCase()).toContain('array');
    }
  });

  it('creates a normalized read file executor from caller supplied file resolver', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:01.000Z'));
    const execute = vi.fn(async ({ files }) => ({
      response: '<file>content</file>',
      usages: [
        {
          moduleName: 'file',
          totalPoints: 0.2
        }
      ],
      nodeResponse: {
        moduleName: 'File parse'
      } as any
    }));

    try {
      const executor = createAgentLoopCoreReadFileExecutor({
        enabled: true,
        resolveFiles: (ids) =>
          ids.map((id) => ({
            id,
            name: `${id}.pdf`,
            url: `/file/${id}.pdf`
          })),
        execute
      });

      expect(executor).toBeDefined();
      const result = await executor!({
        call: {
          id: 'call_read',
          type: 'function',
          function: {
            name: 'read_files',
            arguments: JSON.stringify({
              ids: ['file_1']
            })
          }
        },
        messages: []
      });

      expect(execute).toHaveBeenCalledWith({
        callId: 'call_read',
        files: [
          {
            id: 'file_1',
            name: 'file_1.pdf',
            url: '/file/file_1.pdf'
          }
        ]
      });
      expect(result).toEqual({
        response: '<file>content</file>',
        usages: [
          {
            moduleName: 'file',
            totalPoints: 0.2
          }
        ],
        metadata: expect.objectContaining({
          id: 'call_read',
          nodeId: 'call_read',
          moduleName: 'File parse',
          runningTime: 0,
          totalPoints: 0.2
        }),
        error: undefined
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not create read file executor when disabled', () => {
    expect(
      createAgentLoopCoreReadFileExecutor({
        enabled: false,
        resolveFiles: vi.fn(),
        execute: vi.fn()
      })
    ).toBeUndefined();
  });

  it('normalizes dataset search result as a visible system tool response', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:02.000Z'));
    const startTime = new Date('2026-06-05T00:00:00.000Z').getTime();

    try {
      expect(
        normalizeAgentLoopCoreDatasetSearchResult({
          callId: 'call_dataset',
          startTime,
          response: 'dataset answer',
          nodeResponse: {
            moduleName: ''
          } as any,
          fallback: {
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: 'Dataset search',
            moduleLogo: 'dataset.svg'
          }
        })
      ).toEqual({
        response: 'dataset answer',
        usages: [],
        metadata: expect.objectContaining({
          id: 'call_dataset',
          nodeId: 'call_dataset',
          moduleType: FlowNodeTypeEnum.tool,
          moduleName: 'Dataset search',
          moduleLogo: 'dataset.svg',
          runningTime: 2,
          totalPoints: 0
        })
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('normalizes relative system tool file urls with request origin', () => {
    expect(
      buildAgentLoopCoreSystemToolFileUrl({
        url: '/api/file/a.png',
        requestOrigin: 'https://fastgpt.test'
      })
    ).toBe('https://fastgpt.test/api/file/a.png');
    expect(
      buildAgentLoopCoreSystemToolFileUrl({
        url: 'https://cdn.test/a.png',
        requestOrigin: 'https://fastgpt.test'
      })
    ).toBe('https://cdn.test/a.png');
  });

  it('sums usage points without mutating usages', () => {
    const usages = [
      {
        moduleName: 'a',
        totalPoints: 0.2
      },
      undefined,
      {
        moduleName: 'b',
        totalPoints: 0.3
      }
    ] as any;

    expect(sumAgentLoopCoreUsagePoints(usages)).toBe(0.5);
    expect(usages).toHaveLength(3);
    expect(usages[1]).toBeUndefined();
  });

  it('fills system tool nodeResponse display fields while preserving existing values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:01.500Z'));
    const startTime = new Date('2026-06-05T00:00:00.000Z').getTime();

    try {
      expect(
        mergeAgentLoopCoreSystemToolNodeResponse({
          callId: 'call-1',
          startTime,
          usages: [
            {
              moduleName: 'tool',
              totalPoints: 1
            }
          ],
          fallback: {
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: 'fallback',
            moduleLogo: 'fallback.svg'
          },
          nodeResponse: {
            moduleName: 'existing',
            moduleLogo: 'existing.svg'
          } as any
        })
      ).toEqual({
        id: 'call-1',
        nodeId: 'call-1',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'existing',
        moduleLogo: 'existing.svg',
        runningTime: 1.5,
        totalPoints: 1
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
