import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  ReferenceArrayValueType,
  ReferenceItemValueType
} from '@fastgpt/global/core/workflow/type/io';
import { isValidReferenceValueFormat } from '@fastgpt/global/core/workflow/utils';
import type { WorkflowVariableStateLike } from '../../types/runtime';

type VariableConfig = {
  key: string;
  valueType?: WorkflowIOValueTypeEnum;
};

const dynamicOptionValueTypes = new Set<WorkflowIOValueTypeEnum>([
  WorkflowIOValueTypeEnum.string,
  WorkflowIOValueTypeEnum.arrayString,
  WorkflowIOValueTypeEnum.arrayAny,
  WorkflowIOValueTypeEnum.any
]);

/**
 * Expands option references without the normal reference-array flattening.
 * `arrayString` is the only declaration that creates one option per array item;
 * every permissive declaration remains a single display value.
 */
export const resolveInteractiveDynamicOptions = ({
  references,
  runtimeNodesMap,
  variableState,
  variablesConfig
}: {
  references?: ReferenceArrayValueType | ReferenceItemValueType;
  runtimeNodesMap: Map<string, RuntimeNodeItemType>;
  variableState: WorkflowVariableStateLike;
  variablesConfig?: VariableConfig[];
}): string[] => {
  const normalizedReferences = isValidReferenceValueFormat(references, runtimeNodesMap)
    ? [references]
    : Array.isArray(references)
      ? references
      : [];

  return normalizedReferences.flatMap((reference) => {
    if (!isValidReferenceValueFormat(reference, runtimeNodesMap)) return [];

    const [sourceNodeId, outputId] = reference;
    if (!outputId) return [];

    const resolved = (() => {
      if (sourceNodeId === VARIABLE_NODE_ID) {
        const value = variableState.get(outputId);
        const valueType = variablesConfig?.find((item) => item.key === outputId)?.valueType;
        return { value, valueType };
      }

      const output = runtimeNodesMap
        .get(sourceNodeId)
        ?.outputs.find((item) => item.id === outputId);
      if (!output) return;
      return { value: output.value, valueType: output.valueType };
    })();
    if (!resolved || resolved.value === undefined || resolved.value === null) return [];
    if (resolved.valueType && !dynamicOptionValueTypes.has(resolved.valueType)) return [];

    if (resolved.valueType === WorkflowIOValueTypeEnum.arrayString) {
      return Array.isArray(resolved.value)
        ? resolved.value.filter((item): item is string => typeof item === 'string')
        : [];
    }
    if (resolved.valueType === WorkflowIOValueTypeEnum.string) {
      return typeof resolved.value === 'string' ? [resolved.value] : [];
    }

    return [String(resolved.value)];
  });
};
