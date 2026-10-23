import { describe, expect, it } from 'vitest';
import type { Connection, Edge } from 'reactflow';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getConnectionConflict } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/connection';

describe('getConnectionConflict', () => {
  const toolConnection: Connection = {
    source: 'tools',
    sourceHandle: NodeOutputKeyEnum.selectedTools,
    target: 'target',
    targetHandle: NodeOutputKeyEnum.selectedTools
  };
  const incoming: Edge = {
    id: 'incoming',
    source: 'entry',
    sourceHandle: 'source',
    target: 'target',
    targetHandle: 'target'
  };

  it('rejects self connections and tool connections with existing normal incoming edges', () => {
    const edges = [incoming];
    expect(getConnectionConflict({ ...toolConnection, target: 'tools' }, edges)).toBe('self');
    expect(getConnectionConflict(toolConnection, edges)).toBe('tool-target-has-normal-edges');
    expect(edges).toEqual([incoming]);
  });

  it('allows normal connections, unrelated edges and existing tool connections without deleting them', () => {
    const edges = [
      { ...incoming, target: 'other' },
      { ...incoming, id: 'tool', targetHandle: NodeOutputKeyEnum.selectedTools }
    ];
    expect(getConnectionConflict(toolConnection, edges)).toBeUndefined();
    expect(
      getConnectionConflict({ ...toolConnection, sourceHandle: 'ordinary-source' }, [incoming])
    ).toBeUndefined();
    expect(getConnectionConflict(toolConnection, [])).toBeUndefined();
    expect(edges).toHaveLength(2);
  });
});
