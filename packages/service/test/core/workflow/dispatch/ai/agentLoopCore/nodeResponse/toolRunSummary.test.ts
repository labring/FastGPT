import { summarizeAgentLoopCoreToolRunFlowResponses } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/nodeResponse/toolRunCollector';
import { describe, expect, it } from 'vitest';

describe('summarizeAgentLoopCoreToolRunFlowResponses', () => {
  it('summarizes run times, flow responses and usage points', () => {
    expect(
      summarizeAgentLoopCoreToolRunFlowResponses([
        {
          runTimes: 1,
          flowResponses: [{ moduleName: 'A' } as any],
          flowUsages: [{ moduleName: 'usage-a', totalPoints: 1 }]
        },
        {
          runTimes: 2,
          flowResponses: [{ moduleName: 'B' } as any],
          flowUsages: [{ moduleName: 'usage-b', totalPoints: 2 }]
        }
      ])
    ).toEqual({
      runTimes: 3,
      toolDetail: [{ moduleName: 'A' }, { moduleName: 'B' }],
      toolTotalPoints: 3
    });
  });

  it('keeps zero run times instead of falling back to elapsed seconds', () => {
    expect(
      summarizeAgentLoopCoreToolRunFlowResponses([
        {
          runTimes: 0,
          runtimeNodeResponseSummary: {
            runningTime: 12.5
          },
          flowResponses: [],
          flowUsages: []
        }
      ])
    ).toEqual({
      runTimes: 0,
      toolDetail: [],
      toolTotalPoints: 0
    });
  });
});
