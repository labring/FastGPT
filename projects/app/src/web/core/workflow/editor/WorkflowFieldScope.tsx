import { WorkflowReferenceScope } from '@fastgpt/web/components/common/Textarea/PromptEditor/context';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { isWorkflowReferenceItem } from '@fastgpt/global/common/workflow/reference';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import type {
  WorkflowFieldQuery,
  WorkflowFieldSnapshot
} from '@fastgpt/global/core/workflow/editor/types';
import { useMemo, type ReactNode } from 'react';
import { getWorkflowOutputDisplayLabel } from '../utils';
import { useField } from './react/useField';

/** 按当前语言补齐内置输出的展示文案；Runtime 引用及历史快照保留原始值。 */
export const getWorkflowReferenceDisplayLabels = (
  references: WorkflowFieldSnapshot['references'] | undefined,
  translate: (key: string) => string
) =>
  references?.map((status) => {
    const { reference, sourceLabel, outputLabel, localizeOutputLabel } = status;
    if (!isWorkflowReferenceItem(reference)) return status;

    const nodeLabel =
      sourceLabel === 'common:core.module.Variable' && reference[0] === VARIABLE_NODE_ID
        ? translate('common:core.module.Variable')
        : sourceLabel;
    const label = outputLabel
      ? getWorkflowOutputDisplayLabel({
          label: outputLabel,
          localizeOutputLabel,
          translate
        })
      : outputLabel;
    return nodeLabel === sourceLabel && label === outputLabel
      ? status
      : { ...status, sourceLabel: nodeLabel, outputLabel: label };
  });

export const WorkflowFieldScope = ({
  nodeId,
  fieldKey,
  kind = 'input',
  children
}: WorkflowFieldQuery & { children: ReactNode }) => {
  const { t } = useSafeTranslation();
  const references = useField({ nodeId, fieldKey, kind }, (field) => field?.reference);
  const displayReferences = useMemo(
    () => getWorkflowReferenceDisplayLabels(references, t),
    [references, t]
  );

  return <WorkflowReferenceScope references={displayReferences}>{children}</WorkflowReferenceScope>;
};
