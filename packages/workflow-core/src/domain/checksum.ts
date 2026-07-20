import type { WorkflowDocument } from './document';

const sortRecord = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortRecord);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortRecord(item)])
  );
};

/** 返回字段和集合顺序稳定的文档副本，供序列化、比较和基础 checksum 使用。 */
export const normalizeWorkflowDocument = (document: WorkflowDocument): WorkflowDocument => ({
  ...structuredClone(document),
  app: sortRecord(document.app) as WorkflowDocument['app'],
  nodes: [...document.nodes]
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
    .map((node) => sortRecord(node) as WorkflowDocument['nodes'][number]),
  executionEdges: [...document.executionEdges]
    .sort((left, right) => {
      const leftKey = JSON.stringify(left);
      const rightKey = JSON.stringify(right);
      return leftKey.localeCompare(rightKey);
    })
    .map((edge) => sortRecord(edge) as WorkflowDocument['executionEdges'][number]),
  chatConfig: sortRecord(document.chatConfig) as WorkflowDocument['chatConfig']
});

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/** PR1 的稳定变更标识；PR4 再升级为带并发语义的 canonical SHA-256。 */
export const getWorkflowChecksum = (document: WorkflowDocument) =>
  `fnv1a:${fnv1a(JSON.stringify(normalizeWorkflowDocument(document)))}`;
