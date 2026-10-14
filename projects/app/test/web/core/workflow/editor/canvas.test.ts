import { describe, expect, it } from 'vitest';
import { normalizeEdgeHandles } from '@/web/core/workflow/editor/canvas/canvasTypes';

describe('workflow canvas boundary helpers', () => {
  it('normalizes legacy handle suffixes before renderer matching', () => {
    expect(
      normalizeEdgeHandles({
        sourceHandle: 'source-source-top',
        targetHandle: 'target-target-right'
      })
    ).toEqual({
      sourceHandle: 'source-source-right',
      targetHandle: 'target-target-left'
    });
  });
});
