import { createWorkflowDocument } from '../../src/domain/document';
import { getWorkflowChecksum, normalizeWorkflowDocument } from '../../src/domain/checksum';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import ai from '../fixtures/basic-ai/workflow.json';
import staticWorkflow from '../fixtures/basic-static/workflow.json';
import branching from '../fixtures/branching/workflow.json';
import linear from '../fixtures/common-linear/workflow.json';

describe('canonical workflow checksum', () => {
  it.each([
    [ai, 'sha256:344c64dc671a64b18f581d038da6d850449e5c29aab691ae1a8b671659eebe83'],
    [staticWorkflow, 'sha256:92e1a5979c17fe7b3e6c9dc591e83b828cda323ab7d521e66d25e3a0c8e85de6'],
    [branching, 'sha256:68cf165f5f8c419fde46940effc53b6b6e0272de8ca558efaf43c811df17d12e'],
    [linear, 'sha256:0bde85011ab7797ec522e07897c6756bc18bfbf99f32785f804ba8661e516160']
  ] as const)(
    'preserves existing fixture checksums after contract extraction',
    async (fixture, checksum) => {
      expect(await getWorkflowChecksum(WorkflowDocumentSchema.parse(fixture))).toBe(checksum);
    }
  );

  it('uses SHA-256 over canonical UTF-8 JSON', async () => {
    const document = createWorkflowDocument();
    expect(JSON.stringify(normalizeWorkflowDocument(document))).toBe(
      '{"schemaVersion":"fastgpt-workflow/v1","app":{},"nodes":[],"executionEdges":[],"chatConfig":{}}'
    );
    expect(await getWorkflowChecksum(document)).toBe(
      'sha256:f22ba5bcf46d3006db695d6fe21e290c0321357c294d74b9c2b726c3fac4e5cd'
    );
  });

  it('normalizes object keys and node/edge order while preserving input array order', async () => {
    const left = WorkflowDocumentSchema.parse({ ...ai, app: { name: 'Demo', intro: 'Intro' } });
    const right = {
      chatConfig: left.chatConfig,
      executionEdges: [...left.executionEdges].reverse(),
      nodes: [...left.nodes].reverse(),
      app: { intro: left.app.intro, name: left.app.name },
      schemaVersion: left.schemaVersion
    };
    expect(await getWorkflowChecksum(left)).toBe(await getWorkflowChecksum(right));

    const reorderedInputs = structuredClone(left);
    reorderedInputs.nodes[0].inputs.reverse();
    expect(await getWorkflowChecksum(reorderedInputs)).not.toBe(await getWorkflowChecksum(left));
  });

  it('falls back to pure JS sha256 in insecure HTTP environments without crypto.subtle', async () => {
    const document = createWorkflowDocument({
      app: { name: 'AI 搭建工作流', intro: '私有化部署测试' }
    });
    const expectedChecksum = await getWorkflowChecksum(document);

    const originalCrypto = globalThis.crypto;
    // @ts-ignore
    vi.stubGlobal('crypto', undefined);
    try {
      expect(await getWorkflowChecksum(document)).toBe(expectedChecksum);
    } finally {
      vi.stubGlobal('crypto', originalCrypto);
    }
  });
});
