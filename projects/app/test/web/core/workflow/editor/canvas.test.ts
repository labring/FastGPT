import { describe, expect, it } from 'vitest';
import {
  EDGE_ID_PREFIX,
  encodeRuntimeEdgeId,
  normalizeEdgeHandles
} from '@/web/core/workflow/editor/canvas/canvasTypes';

describe('workflow canvas boundary helpers', () => {
  it('encodes runtime edge indexes without depending on ReactFlow edge ids', () => {
    expect(encodeRuntimeEdgeId(3)).toBe(`${EDGE_ID_PREFIX}3`);
  });

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
