import { createWorkflowDocument, getWorkflowChecksum, normalizeWorkflowDocument } from '../../src';
import { describe, expect, it } from 'vitest';

describe('canonical workflow checksum', () => {
  it('uses SHA-256 over canonical UTF-8 JSON', async () => {
    const document = createWorkflowDocument();
    expect(JSON.stringify(normalizeWorkflowDocument(document))).toBe(
      '{"schemaVersion":"fastgpt-workflow/v1","app":{},"nodes":[],"executionEdges":[],"chatConfig":{}}'
    );
    expect(await getWorkflowChecksum(document)).toBe(
      'sha256:f22ba5bcf46d3006db695d6fe21e290c0321357c294d74b9c2b726c3fac4e5cd'
    );
  });

  it('normalizes object key order without changing array semantics', async () => {
    const left = createWorkflowDocument({
      app: { name: 'Demo', intro: 'Intro' },
      chatConfig: { variables: [] }
    });
    const right = {
      chatConfig: left.chatConfig,
      executionEdges: left.executionEdges,
      nodes: left.nodes,
      app: { intro: left.app.intro, name: left.app.name },
      schemaVersion: left.schemaVersion
    };
    expect(await getWorkflowChecksum(left)).toBe(await getWorkflowChecksum(right));
  });
});
