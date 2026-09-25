import type { WorkflowDocument } from './document';

const sortRecord = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortRecord);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, sortRecord(item)])
  );
};

/** 返回字段和集合顺序稳定的文档副本，供序列化、比较和基础 checksum 使用。 */
export const normalizeWorkflowDocument = (document: WorkflowDocument): WorkflowDocument => ({
  schemaVersion: document.schemaVersion,
  app: sortRecord(document.app) as WorkflowDocument['app'],
  nodes: [...document.nodes]
    .sort((left, right) => (left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0))
    .map((node) => sortRecord(node) as WorkflowDocument['nodes'][number]),
  executionEdges: [...document.executionEdges]
    .map((edge) => sortRecord(edge) as WorkflowDocument['executionEdges'][number])
    .sort((left, right) => {
      const leftKey = JSON.stringify(left);
      const rightKey = JSON.stringify(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
  chatConfig: sortRecord(document.chatConfig) as WorkflowDocument['chatConfig']
});

/** 对规范化后的 UTF-8 JSON 计算跨 Node/Browser 一致的 SHA-256。 */
export const getWorkflowChecksum = async (document: WorkflowDocument) => {
  const canonicalDocument = JSON.stringify(normalizeWorkflowDocument(document));
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalDocument)
  );
  const checksum = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `sha256:${checksum}`;
};
