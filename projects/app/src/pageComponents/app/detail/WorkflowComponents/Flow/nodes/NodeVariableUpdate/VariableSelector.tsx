import React from 'react';
import { useTranslation } from 'next-i18next';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  ReferenceValueType,
  WorkflowReferenceSnapshot
} from '@fastgpt/global/core/workflow/type/io';
import { ReferSelector, useReference } from '../render/RenderInput/templates/Reference';

type Props = {
  nodeId: string;
  variable?: ReferenceValueType;
  valueType?: WorkflowIOValueTypeEnum;
  referenceSnapshots?: WorkflowReferenceSnapshot[];
  onSelect: (e?: ReferenceValueType, snapshots?: WorkflowReferenceSnapshot[]) => void;
};

const VariableSelector = ({ nodeId, variable, valueType, referenceSnapshots, onSelect }: Props) => {
  const { t } = useTranslation();

  const { referenceList, sourceNodes } = useReference({
    nodeId,
    valueType
  });

  return (
    <ReferSelector
      placeholder={t('common:select_reference_variable')}
      list={referenceList}
      sourceNodes={sourceNodes}
      valueType={valueType}
      referenceSnapshots={referenceSnapshots}
      value={variable}
      onSelect={onSelect}
      isArray={valueType?.startsWith('array')}
    />
  );
};

export default VariableSelector;
