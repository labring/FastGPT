import type { WorkflowDocument } from '../domain/document';
import type { WorkflowDiagnostic } from '../domain/diagnostic';
import { getInputAutomationMeta } from '../template/automationMeta';
import { hasConfiguredValue } from '../template/defaultValue';
import type { WorkflowBindingRequirement } from './type';

/** 收集无法由本地结构校验证明完整或有效的外部输入绑定，不返回实际值。 */
export const collectWorkflowBindings = (document: WorkflowDocument): WorkflowBindingRequirement[] =>
  document.nodes.flatMap((node) =>
    node.inputs.flatMap((input) => {
      const meta = getInputAutomationMeta(node.flowNodeType, input.key);
      if (
        !meta ||
        (meta.defaultPolicy !== 'userRequired' && meta.defaultPolicy !== 'remoteValidated')
      )
        return [];

      const defaultPolicy = meta.defaultPolicy;
      const configured = hasConfiguredValue(input.value);
      const bindingRequired = input.required === true || meta.bindingRequired === true;
      const status = (() => {
        if (!configured && bindingRequired) return 'missing' as const;
        if (configured && defaultPolicy === 'remoteValidated') return 'unverified' as const;
      })();
      if (!status) return [];

      return [
        {
          nodeId: node.nodeId,
          inputKey: input.key,
          defaultPolicy,
          resourceKind: meta.resourceKind,
          status
        }
      ];
    })
  );

/** 将绑定状态转换为 CLI/Web 可统一展示的非阻断诊断。 */
export const getWorkflowBindingDiagnostics = (
  bindings: WorkflowBindingRequirement[]
): WorkflowDiagnostic[] =>
  bindings.map((binding) => ({
    code:
      binding.status === 'missing' ? 'WORKFLOW_BINDING_REQUIRED' : 'WORKFLOW_BINDING_UNVERIFIED',
    severity: 'warning',
    nodeId: binding.nodeId,
    inputKey: binding.inputKey,
    params: {
      defaultPolicy: binding.defaultPolicy,
      ...(binding.resourceKind ? { resourceKind: binding.resourceKind } : {})
    }
  }));
