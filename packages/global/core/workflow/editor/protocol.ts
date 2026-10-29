import {
  CanonicalWorkflowDataSchema,
  migrateWorkflowToCurrent,
  StoreWorkflowInputSchema,
  type CanonicalWorkflowData
} from '../migration';
import { restoreRuntimeNodeOutputValidity } from './runtime/documentRules';
import { createWorkflowEditor } from './runtime/runtime';
import type { WorkflowRuntimePort, WorkflowRuntimeOptions } from './types';

export type StoreWorkflow = CanonicalWorkflowData;

/** StoreWorkflow 输入边界；先迁移并严格 canonicalize，再创建新的 runtime。 */
export const migrateStoreWorkflow = (input: unknown): CanonicalWorkflowData => {
  return migrateWorkflowToCurrent(StoreWorkflowInputSchema.parse(input));
};

/** 从 StoreWorkflow 创建 fresh Runtime；迁移校验后恢复内存态输出回调，不改持久化形状。 */
export const hydrateWorkflowEditor = (
  input: unknown,
  options?: WorkflowRuntimeOptions
): WorkflowRuntimePort => {
  const inputNodes =
    typeof input === 'object' && input !== null && 'nodes' in input && Array.isArray(input.nodes)
      ? input.nodes
      : [];
  const workflow = migrateStoreWorkflow(input);
  return createWorkflowEditor(
    {
      ...workflow,
      nodes: workflow.nodes.map((node, index) =>
        restoreRuntimeNodeOutputValidity(node, inputNodes[index])
      )
    },
    options
  );
};

/** 读取 runtime 的持久化数据并再次通过 canonical schema，移除 runtime-only 字段。 */
export const serializeWorkflowEditor = (editor: WorkflowRuntimePort): StoreWorkflow => {
  return CanonicalWorkflowDataSchema.parse(editor.getWorkflowData());
};
