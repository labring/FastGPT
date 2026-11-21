import { describe, expect, it } from 'vitest';
import { WorkflowCheckIssueCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  checkAgentResourceIssues,
  checkAgentSandboxIssues,
  checkWorkflowNodeResourceRules
} from '../../../../../src/web/core/workflow/check/resource';
import { resolvePluginDataErrorIssueCode } from '../../../../../src/web/core/workflow/check/error';

describe('shared workflow resource rules', () => {
  it('keeps sandbox defaults and disabled states on the existing form issue contract', () => {
    expect(
      checkAgentSandboxIssues({
        useAgentSandbox: false,
        hasSkills: false
      })
    ).toEqual([]);
    expect(
      checkAgentSandboxIssues({
        useAgentSandbox: true,
        hasSkills: false
      })
    ).toEqual([
      {
        code: WorkflowCheckIssueCodeEnum.sandboxSystemUnavailable,
        inputKey: NodeInputKeyEnum.useAgentSandbox
      }
    ]);
    expect(
      checkAgentSandboxIssues({
        useAgentSandbox: false,
        hasSkills: true,
        showSandbox: true,
        enableSandbox: true
      })
    ).toEqual([
      {
        code: WorkflowCheckIssueCodeEnum.sandboxSkillUnavailable,
        inputKey: NodeInputKeyEnum.skills
      }
    ]);
  });

  it('preserves permission and missing resource codes plus specialized Agent messages', () => {
    expect(
      checkAgentResourceIssues({
        datasets: [{ error: 'resource_no_permission' }, { error: 'resource_missing' }],
        skills: [{ error: 'resource_no_permission' }]
      })
    ).toEqual([
      {
        code: WorkflowCheckIssueCodeEnum.resourceNoPermission,
        inputKey: NodeInputKeyEnum.datasetSelectList,
        messageCode: WorkflowCheckIssueCodeEnum.agentDatasetAbnormal
      },
      {
        code: WorkflowCheckIssueCodeEnum.resourceMissing,
        inputKey: NodeInputKeyEnum.datasetSelectList,
        messageCode: WorkflowCheckIssueCodeEnum.agentDatasetAbnormal
      },
      {
        code: WorkflowCheckIssueCodeEnum.resourceNoPermission,
        inputKey: NodeInputKeyEnum.skills,
        messageCode: WorkflowCheckIssueCodeEnum.agentSkillAbnormal
      }
    ]);
  });

  it('uses datasetParams as the sole Agent dataset snapshot when present', () => {
    const data: FlowNodeItemType = {
      nodeId: 'agent',
      flowNodeType: FlowNodeTypeEnum.agent,
      name: 'Agent',
      inputs: [
        {
          key: NodeInputKeyEnum.datasetParams,
          value: { datasets: [{ error: 'resource_no_permission' }] }
        },
        {
          key: NodeInputKeyEnum.datasetSelectList,
          value: [{ error: 'resource_missing' }]
        }
      ],
      outputs: []
    };

    expect(
      checkWorkflowNodeResourceRules({ data, bindings: [] }).filter(
        (issue) =>
          issue.code === WorkflowCheckIssueCodeEnum.resourceNoPermission ||
          issue.code === WorkflowCheckIssueCodeEnum.resourceMissing
      )
    ).toEqual([
      {
        code: WorkflowCheckIssueCodeEnum.resourceNoPermission,
        inputKey: NodeInputKeyEnum.datasetParams,
        messageCode: WorkflowCheckIssueCodeEnum.agentDatasetAbnormal
      }
    ]);
  });

  it('shares plugin permission and missing classification while preserving app issue codes', () => {
    expect(resolvePluginDataErrorIssueCode(AppErrEnum.unAuthApp)).toBe(
      WorkflowCheckIssueCodeEnum.resourceNoPermission
    );
    expect(resolvePluginDataErrorIssueCode(ERROR_RESPONSE[PluginErrEnum.unAuth]!.message)).toBe(
      WorkflowCheckIssueCodeEnum.resourceNoPermission
    );
    expect(resolvePluginDataErrorIssueCode(AppErrEnum.unExist)).toBe(
      WorkflowCheckIssueCodeEnum.toolMissing
    );
    expect(resolvePluginDataErrorIssueCode('unrecognized plugin failure')).toBe(
      WorkflowCheckIssueCodeEnum.toolLoadFailed
    );
  });
});
