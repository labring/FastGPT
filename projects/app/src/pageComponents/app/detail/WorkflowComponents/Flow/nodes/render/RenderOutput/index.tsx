import React, { useEffect, useMemo } from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import OutputLabel from './Label';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import DynamicOutputs from './DynamicOutputs';

const RenderOutput = ({
  nodeId,
  flowOutputList
}: {
  nodeId: string;
  flowOutputList: FlowNodeOutputItemType[];
}) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const outputString = useMemo(() => JSON.stringify(flowOutputList), [flowOutputList]);
  const copyOutputs = useMemo(() => {
    return JSON.parse(outputString) as FlowNodeOutputItemType[];
  }, [outputString]);

  // Condition check
  const inputs = useContextSelector(WorkflowContext, (v) => {
    const node = v.nodeList.find((node) => node.nodeId === nodeId);
    return JSON.stringify(node?.inputs);
  });

  useEffect(() => {
    flowOutputList.forEach((output) => {
      if (!output.invalidCondition || !inputs) return;
      const parsedInputs = JSON.parse(inputs);

      const invalid = output.invalidCondition({
        inputs: parsedInputs,
        llmModelList
      });
      onChangeNode({
        nodeId,
        type: 'replaceOutput',
        key: output.key,
        value: {
          ...output,
          invalid
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyOutputs, nodeId, inputs, llmModelList]);

  const RenderDynamicOutputs = useMemo(() => {
    const dynamicOutputs = copyOutputs.filter(
      (item) => item.type === FlowNodeOutputTypeEnum.dynamic
    );
    const addOutput = dynamicOutputs.find((item) => item.key === NodeOutputKeyEnum.addOutputParam);
    const filterAddOutput = dynamicOutputs.filter(
      (item) => item.key !== NodeOutputKeyEnum.addOutputParam
    );

    return !addOutput?.customFieldConfig ? null : (
      <DynamicOutputs
        nodeId={nodeId}
        outputs={filterAddOutput}
        addOutputConfig={addOutput?.customFieldConfig}
        title={t((addOutput.label || 'common:core.workflow.Custom outputs') as any)}
        description={addOutput.description}
      />
    );
  }, [copyOutputs, nodeId, t]);

  const RenderCommonOutputs = useMemo(() => {
    const renderOutputs = copyOutputs.filter(
      (item) =>
        item.type !== FlowNodeOutputTypeEnum.dynamic && item.type !== FlowNodeOutputTypeEnum.hidden
    );

    return (
      <>
        {renderOutputs.map((output, i) => {
          return output.label && output.invalid !== true ? (
            <FormLabel
              key={output.key}
              required={output.required}
              position={'relative'}
              _notLast={{
                mb: i !== renderOutputs.length - 1 ? 4 : 0
              }}
            >
              <OutputLabel nodeId={nodeId} output={output} />
            </FormLabel>
          ) : null;
        })}
      </>
    );
  }, [copyOutputs, nodeId]);

  return (
    <>
      {RenderDynamicOutputs}
      {RenderCommonOutputs}
    </>
  );
};

export default React.memo(RenderOutput);
