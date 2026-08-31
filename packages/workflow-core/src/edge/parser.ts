import { WorkflowCommandError } from '../domain/diagnostic';
import type { ExecutionSourcePortRef, ExecutionTargetPortRef } from './type';

/** 解析 `node@port` 形式的执行源端口。 */
export const parseExecutionSourcePortRef = (value: string): ExecutionSourcePortRef => {
  const separatorIndex = value.lastIndexOf('@');
  const nodeId = value.slice(0, separatorIndex);
  const port = value.slice(separatorIndex + 1);

  if (separatorIndex <= 0 || !port) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_SOURCE_PORT_INVALID', severity: 'error', params: { value } }
    ]);
  }

  if (port === 'next') return { kind: 'next', nodeId };
  if (port === 'catch') return { kind: 'catch', nodeId };
  if (port === 'tools') return { kind: 'selectedTools', nodeId };
  if (port.startsWith('branch:')) {
    const branchKey = port.slice('branch:'.length);
    if (branchKey) return { kind: 'branch', nodeId, branchKey };
  }
  if (port.startsWith('output:')) {
    const outputKey = port.slice('output:'.length);
    if (outputKey) return { kind: 'sourceOutput', nodeId, outputKey };
  }

  throw new WorkflowCommandError([
    { code: 'WORKFLOW_SOURCE_PORT_UNSUPPORTED', severity: 'error', params: { value } }
  ]);
};

/** 解析 `node@target` 或 `node@tools` 形式的执行目标端口。 */
export const parseExecutionTargetPortRef = (value: string): ExecutionTargetPortRef => {
  const separatorIndex = value.lastIndexOf('@');
  const nodeId = value.slice(0, separatorIndex);
  const port = value.slice(separatorIndex + 1);

  if (separatorIndex <= 0 || !port) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_TARGET_PORT_INVALID', severity: 'error', params: { value } }
    ]);
  }

  if (port === 'target') return { kind: 'target', nodeId };
  if (port === 'tools') return { kind: 'selectedTools', nodeId };

  throw new WorkflowCommandError([
    { code: 'WORKFLOW_TARGET_PORT_UNSUPPORTED', severity: 'error', params: { value } }
  ]);
};
