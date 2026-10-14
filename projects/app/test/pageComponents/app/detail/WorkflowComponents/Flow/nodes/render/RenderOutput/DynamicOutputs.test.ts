import { describe, expect, it } from 'vitest';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { getDynamicOutputDisconnectCommands } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderOutput/DynamicOutputs';

const edges = [
  {
    source: 'node-1',
    sourceHandle: getHandleId('node-1', 'source', 'output-a'),
    target: 'node-2',
    targetHandle: 'input-a'
  }
] as Parameters<typeof getDynamicOutputDisconnectCommands>[0]['edges'];

describe('getDynamicOutputDisconnectCommands', () => {
  it('keeps downstream edges when output metadata changes', () => {
    const updatedOutput = {
      key: 'output-a',
      label: 'Renamed',
      type: FlowNodeOutputTypeEnum.source,
      valueType: WorkflowIOValueTypeEnum.string
    };

    expect(
      getDynamicOutputDisconnectCommands({
        edges,
        nodeId: 'node-1',
        originalKey: 'output-a',
        nextKey: updatedOutput.key
      })
    ).toEqual([]);
  });

  it('disconnects downstream edges when output key changes', () => {
    expect(
      getDynamicOutputDisconnectCommands({
        edges,
        nodeId: 'node-1',
        originalKey: 'output-a',
        nextKey: 'output-b'
      })
    ).toEqual([{ index: 0 }]);
  });

  it('disconnects downstream edges when output is deleted', () => {
    expect(
      getDynamicOutputDisconnectCommands({
        edges,
        nodeId: 'node-1',
        originalKey: 'output-a'
      })
    ).toEqual([{ index: 0 }]);
  });
});
