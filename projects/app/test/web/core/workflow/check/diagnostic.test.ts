import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { describe, expect, it } from 'vitest';
import { formatWorkflowDiagnostic } from '@/web/core/workflow/check/diagnostic';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import workflowZh from '@fastgpt/web/i18n/zh-CN/workflow.json';
import commonZh from '@fastgpt/web/i18n/zh-CN/common.json';
import type { TFunction } from 'next-i18next';

describe('formatWorkflowDiagnostic', () => {
  const t = ((key: string, params?: Record<string, unknown>) => {
    const resources = key.startsWith('workflow:') ? workflowZh : commonZh;
    const text =
      (resources as Record<string, string>)[key.replace(/^(common|workflow):/, '')] ?? key;
    return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));
  }) as TFunction;
  const node: FlowNodeItemType = {
    nodeId: 'target',
    name: 'Target',
    flowNodeType: FlowNodeTypeEnum.chatNode,
    inputs: [],
    outputs: []
  } as FlowNodeItemType;

  it('explains that an existing tool attachment must be removed before reassignment', () => {
    expect(
      formatWorkflowDiagnostic({
        diagnostic: {
          code: WorkflowDiagnosticCodeEnum.toolTargetAlreadyAttached,
          severity: 'error',
          nodeId: 'target',
          params: { ownerNodeId: 'caller-a' }
        },
        node,
        t
      })
    ).toMatchObject({ level: 'error', message: workflowZh.tool_target_already_attached });
  });

  it('explains why a cycle without a branch is forbidden', () => {
    expect(
      formatWorkflowDiagnostic({
        diagnostic: {
          code: WorkflowDiagnosticCodeEnum.edgeCreatesCycle,
          severity: 'error',
          params: {
            edge: {
              source: { kind: 'next', nodeId: 'B' },
              target: { kind: 'target', nodeId: 'A' }
            }
          }
        },
        node,
        t
      }).message
    ).toBe('节点 B 到 A 的连线会形成纯串行回环，请通过条件或异常分支控制回流');
  });

  it('keeps existing variable-update and model field labels while preserving severity', () => {
    expect(
      formatWorkflowDiagnostic({
        diagnostic: {
          code: WorkflowDiagnosticCodeEnum.variableUpdateTargetMissing,
          severity: 'error',
          inputKey: NodeInputKeyEnum.updateList
        },
        node,
        t
      }).message
    ).toBe('需填写必填项 变量');
    expect(
      formatWorkflowDiagnostic({
        diagnostic: {
          code: WorkflowDiagnosticCodeEnum.variableUpdateValueMissing,
          severity: 'error',
          inputKey: NodeInputKeyEnum.updateList
        },
        node,
        t
      }).message
    ).toBe('需填写必填项 值');
    expect(
      formatWorkflowDiagnostic({
        diagnostic: {
          code: WorkflowDiagnosticCodeEnum.templateParameterSchemaMissing,
          severity: 'warning',
          inputKey: 'payload'
        },
        node,
        t
      })
    ).toMatchObject({ level: 'warning', message: '输入项 payload 缺少结构校验定义' });
  });

  it('uses the precise duplicate model input from the diagnostic path', () => {
    const duplicateNode = {
      ...node,
      inputs: [
        {
          key: NodeInputKeyEnum.aiModelId,
          label: '第一个模型',
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        },
        {
          key: NodeInputKeyEnum.aiModelId,
          label: '第二个模型',
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ]
    };
    expect(
      formatWorkflowDiagnostic({
        node: duplicateNode,
        t,
        diagnostic: {
          code: WorkflowDiagnosticCodeEnum.modelRequired,
          severity: 'error',
          inputKey: NodeInputKeyEnum.aiModelId,
          path: ['nodes', 1, 'inputs', 1, 'value']
        }
      }).message
    ).toBe('未配置[第二个模型]模型');
  });

  it('reports structural branch/form details instead of saying a configured value is empty', () => {
    expect(
      formatWorkflowDiagnostic({
        diagnostic: {
          code: WorkflowDiagnosticCodeEnum.branchConfigurationInvalid,
          severity: 'error',
          params: { reason: 'invalid_keys' }
        },
        node: { ...node, flowNodeType: FlowNodeTypeEnum.userSelect },
        t
      }).message
    ).toBe('选项或分类的键名缺失或重复，请检查配置');
    expect(
      formatWorkflowDiagnostic({
        diagnostic: {
          code: WorkflowDiagnosticCodeEnum.formInputConfigurationInvalid,
          severity: 'error',
          params: { reason: 'invalid_field', fieldKeys: ['missingOutput'] }
        },
        node,
        t
      }).message
    ).toBe('表单字段的键名或对应输出配置不完整：missingOutput');
  });

  it('preserves the exact reason and parameters for registered but unmapped diagnostics', () => {
    expect(
      formatWorkflowDiagnostic({
        diagnostic: {
          code: WorkflowDiagnosticCodeEnum.outputReferencesRemain,
          severity: 'error',
          params: { reason: 'original error detail' }
        },
        t
      }).message
    ).toBe('original error detail');
    expect(
      formatWorkflowDiagnostic({
        diagnostic: {
          code: WorkflowDiagnosticCodeEnum.outputReferencesRemain,
          severity: 'warning',
          params: { expected: 2 }
        },
        t
      })
    ).toMatchObject({
      level: 'warning',
      nodeId: '__workflow__',
      message: `${WorkflowDiagnosticCodeEnum.outputReferencesRemain}: {"expected":2}`
    });
    expect(
      formatWorkflowDiagnostic({
        diagnostic: { code: WorkflowDiagnosticCodeEnum.outputReferencesRemain, severity: 'error' }
      }).message
    ).toBe(WorkflowDiagnosticCodeEnum.outputReferencesRemain);
  });
});
