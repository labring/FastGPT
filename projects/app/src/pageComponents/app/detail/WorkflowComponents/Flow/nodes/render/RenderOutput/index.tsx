import React, { useEffect, useMemo } from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import OutputLabel from './Label';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import DynamicOutputs from './DynamicOutputs';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useDeepCompareEffect } from 'ahooks';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';

const RenderOutput = ({
  nodeId,
  flowOutputList
}: {
  nodeId: string;
  flowOutputList: FlowNodeOutputItemType[];
}) => {
  const { llmModelList } = useSystemStore();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const copyOutputs = useMemoEnhance(() => {
    return flowOutputList;
  }, [flowOutputList]);

  // Condition check
  const inputs = useContextSelector(WorkflowBufferDataContext, (v) => {
    const node = v.getNodeById(nodeId);
    return node?.inputs;
  });
  useDeepCompareEffect(() => {
    flowOutputList.forEach((output) => {
      if (!output.invalidCondition || !inputs) return;

      const invalid = output.invalidCondition({
        inputs,
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
  }, [copyOutputs, nodeId, inputs, llmModelList, flowOutputList, onChangeNode]);

  const RenderDynamicOutputs = useMemo(() => {
    const dynamicOutputs = copyOutputs.filter(
      (item) => item.type === FlowNodeOutputTypeEnum.dynamic
    );
    const addOutput = dynamicOutputs.find((item) => item.key === NodeOutputKeyEnum.addOutputParam);
    const filterAddOutput = dynamicOutputs.filter(
      (item) => item.key !== NodeOutputKeyEnum.addOutputParam
    );

    return addOutput ? (
      <DynamicOutputs nodeId={nodeId} outputs={filterAddOutput} addOutput={addOutput} />
    ) : null;
  }, [copyOutputs, nodeId]);

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
