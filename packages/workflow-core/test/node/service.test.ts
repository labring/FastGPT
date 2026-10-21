import { describe, expect, it } from 'vitest';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { createWorkflowDocument } from '../../src/domain/document';
import { cloneNode } from '../../src/node/service';

describe('cloneNode', () => {
  it('preserves the same unique-system-node protection as Web copy and paste', () => {
    for (const template of moduleTemplatesFlat.filter((template) => template.unique)) {
      const document = createWorkflowDocument({ nodes: [{ ...template, nodeId: 'system' }] });
      const before = structuredClone(document);
      expect(
        () => cloneNode({ document, sourceNodeId: 'system', nodeId: 'copy' }),
        template.flowNodeType
      ).toThrow('WORKFLOW_UNIQUE_NODE_CLONE_FORBIDDEN');
      expect(document).toEqual(before);
    }
  });
});
