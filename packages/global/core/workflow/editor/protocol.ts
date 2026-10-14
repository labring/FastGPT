import {
  CanonicalWorkflowDataSchema,
  migrateWorkflowToCurrent,
  StoreWorkflowInputSchema,
  type CanonicalWorkflowData
} from '../migration';
import { createWorkflowEditor } from './runtime/runtime';
import type { WorkflowRuntimePort, WorkflowRuntimeOptions } from './types';

export type StoreWorkflow = CanonicalWorkflowData;

/** StoreWorkflow 输入边界；先迁移并严格 canonicalize，再创建新的 runtime。 */
export const migrateStoreWorkflow = (input: unknown): CanonicalWorkflowData => {
  return migrateWorkflowToCurrent(StoreWorkflowInputSchema.parse(input));
};

/** 从本地 StoreWorkflow 创建 fresh runtime；失败时不会产生可见 runtime。 */
export const hydrateWorkflowEditor = (
  input: unknown,
  options?: WorkflowRuntimeOptions
): WorkflowRuntimePort => {
  return createWorkflowEditor(migrateStoreWorkflow(input), options);
};

/** 读取 runtime 的持久化数据并再次通过 canonical schema，移除 runtime-only 字段。 */
export const serializeWorkflowEditor = (editor: WorkflowRuntimePort): StoreWorkflow => {
  return CanonicalWorkflowDataSchema.parse(editor.getWorkflowData());
};
