import { describe, expect, it } from 'vitest';
import { getPasteSelectionChanges } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/keyboard';

describe('paste selection changes', () => {
  it.each([
    ['single', ['node-1']],
    ['multiple', ['node-1', 'node-2']]
  ])('selects %s pasted nodes', (_, nodeIds) => {
    expect(getPasteSelectionChanges(nodeIds)).toEqual(
      nodeIds.map((id) => ({ type: 'select', id, selected: true }))
    );
  });
});
