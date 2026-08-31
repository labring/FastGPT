import z from 'zod';
import { WorkflowCommandError } from '../domain/diagnostic';

export const VariableRefSchema = z.object({
  nodeId: z.string().min(1),
  outputKey: z.string().min(1)
});

export type VariableRef = z.infer<typeof VariableRefSchema>;

/** 解析 `node.output`，节点 ID 可包含点，最后一个点固定分隔 output key。 */
export const parseVariableRef = (value: string): VariableRef => {
  const separatorIndex = value.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_VARIABLE_REF_INVALID', severity: 'error', params: { value } }
    ]);
  }

  return {
    nodeId: value.slice(0, separatorIndex),
    outputKey: value.slice(separatorIndex + 1)
  };
};
