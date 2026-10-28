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

  it.each([undefined, null, false, 0, ''])(
    'treats a returned falsy exception as failure: %j',
    (error) => {
      expect(getWorkflowStepStatus(createResult({ error }))).toBe('error');
    }
  );

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

  it('treats a display-only error as failure without inferring its classification', () => {
    expect(
      getWorkflowStepStatus(
        createResult({
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            error: 'Invalid MCP configuration'
          }
        })
      )
    ).toBe('error');
  });

  it('classifies the current raw system error independently of the displayed text', () => {
    expect(
      getWorkflowStepStatus(
        createResult({
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            error: 'Invalid MCP configuration'
          },
          error: {
            errorText: 'database unavailable'
          }
        })
      )
    ).toBe('error');
  });
});
