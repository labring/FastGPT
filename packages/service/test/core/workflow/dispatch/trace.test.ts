import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { getWorkflowStepStatus } from '@fastgpt/service/core/workflow/dispatch/utils/trace';

const createResult = (result: Record<string, any>) =>
  ({
    node: {
      nodeId: 'node-id',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'Tool',
      inputs: [],
      outputs: []
    },
    runStatus: 'run',
    nodeResponseId: 'response-id',
    result
  }) as any;

describe('getWorkflowStepStatus', () => {
  it('returns ok for a successful node', () => {
    expect(getWorkflowStepStatus(createResult({}))).toBe('ok');
  });

  it('returns error for a system failure', () => {
    expect(
      getWorkflowStepStatus(
        createResult({
          error: { errorText: 'system failure' }
        })
      )
    ).toBe('error');
  });

  it('returns user_error for user configuration failures', () => {
    expect(
      getWorkflowStepStatus(
        createResult({
          error: new UserConfigError('Invalid MCP configuration')
        })
      )
    ).toBe('user_error');
  });

  it('recognizes serialized user configuration errors', () => {
    expect(
      getWorkflowStepStatus(
        createResult({
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            error: 'Invalid MCP configuration'
          },
          error: {
            errorText: 'Invalid MCP configuration',
            name: 'UserConfigError'
          }
        })
      )
    ).toBe('user_error');
  });

  it('recognizes the node response error marker', () => {
    expect(
      getWorkflowStepStatus(
        createResult({
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            error: 'Invalid MCP configuration',
            errorType: 'UserConfigError'
          }
        })
      )
    ).toBe('user_error');
  });

  it('keeps a system error when a stale node response carries a user error marker', () => {
    expect(
      getWorkflowStepStatus(
        createResult({
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            error: 'Invalid MCP configuration',
            errorType: 'UserConfigError'
          },
          error: {
            errorText: 'database unavailable'
          }
        })
      )
    ).toBe('error');
  });
});
