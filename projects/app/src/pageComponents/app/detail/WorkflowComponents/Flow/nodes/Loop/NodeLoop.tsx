/*
  The loop node has controllable width and height properties, which serve as the parent node of loopFlow.
  When the childNodes of loopFlow change, it automatically calculates the rectangular width, height, and position of the childNodes, 
  thereby further updating the width and height properties of the loop node.
*/
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useEffect, useMemo, useRef } from 'react';
import { Background, type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import Container from '../../components/Container';
import IOTitle from '../../components/IOTitle';
import { useTranslation } from 'next-i18next';
import RenderInput from '../render/RenderInput';
import { Box } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import RenderOutput from '../render/RenderOutput';
import {
  ArrayTypeMap,
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  Input_Template_Children_Node_List,
  Input_Template_LOOP_NODE_OFFSET
} from '@fastgpt/global/core/workflow/template/input';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { AppContext } from '../../../../context';
import { isValidArrayReferenceValue } from '@fastgpt/global/core/workflow/utils';
import { type ReferenceArrayValueType } from '@fastgpt/global/core/workflow/type/io';
import { useSize } from 'ahooks';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { WorkflowLayoutContext } from '../../../context/workflowComputeContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

const NodeLoop = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs, isFolded, flowNodeType } = data;
  const { getNodeById, nodeIds, nodeAmount, getNodeList, systemConfigNode } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const resetParentNodeSizeAndPosition = useContextSelector(
    WorkflowLayoutContext,
    (v) => v.resetParentNodeSizeAndPosition
  );
  const computedResult = useMemoEnhance(() => {
    return {
      nodeWidth: Math.round(
        Number(inputs.find((input) => input.key === NodeInputKeyEnum.nodeWidth)?.value) || 500
      ),
      nodeHeight: Math.round(
        Number(inputs.find((input) => input.key === NodeInputKeyEnum.nodeHeight)?.value) || 500
      ),
      loopInputArray: inputs.find((input) => input.key === NodeInputKeyEnum.loopInputArray),
      loopNodeInputHeight: inputs.find(
        (input) => input.key === NodeInputKeyEnum.loopNodeInputHeight
      )
    };
  }, [inputs]);
  const nodeWidth = computedResult.nodeWidth;
  const nodeHeight = computedResult.nodeHeight;
  const loopInputArray = useMemoEnhance(
    () => computedResult.loopInputArray,
    [computedResult.loopInputArray]
  );
  const loopNodeInputHeight = computedResult.loopNodeInputHeight ?? Input_Template_LOOP_NODE_OFFSET;

  // Update array input type
  // Computed the reference value type
  const newValueType = useMemo(() => {
    if (!loopInputArray) return WorkflowIOValueTypeEnum.arrayAny;
    const value = loopInputArray.value as ReferenceArrayValueType;

    if (!value || value.length === 0 || !isValidArrayReferenceValue(value, nodeIds))
      return WorkflowIOValueTypeEnum.arrayAny;

    const globalVariables = getWorkflowGlobalVariables({
      systemConfigNode,
      chatConfig: appDetail.chatConfig
    });

    const valueType = ((value) => {
      if (value?.[0] === VARIABLE_NODE_ID) {
        return globalVariables.find((item) => item.key === value[1])?.valueType;
      } else {
        const node = getNodeById(value?.[0]);
        const output = node?.outputs.find((output) => output.id === value?.[1]);
        return output?.valueType;
      }
    })(value[0]);
    return ArrayTypeMap[valueType as keyof typeof ArrayTypeMap] ?? WorkflowIOValueTypeEnum.arrayAny;
  }, [appDetail.chatConfig, getNodeById, loopInputArray, nodeIds, systemConfigNode]);
  useEffect(() => {
    if (!loopInputArray) return;
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: NodeInputKeyEnum.loopInputArray,
      value: {
        ...loopInputArray,
        valueType: newValueType
      }
    });
  }, [loopInputArray, newValueType, nodeId, onChangeNode]);

  // Normalize batch numeric inputs to keep UI and backend behavior consistent.
  useEffect(() => {
    if (flowNodeType !== FlowNodeTypeEnum.batch) return;

    const normalizeInput = ({
      key,
      min,
      max,
      defaultValue
    }: {
      key: NodeInputKeyEnum;
      min: number;
      max: number;
      defaultValue: number;
    }) => {
      const input = inputs.find((item) => item.key === key);
      if (!input) return;

      const num = Math.floor(Number(input.value));
      const nextValue = Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : defaultValue;

      if (input.value === nextValue) return;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key,
        value: {
          ...input,
          value: nextValue
        }
      });
    };

    normalizeInput({
      key: NodeInputKeyEnum.batchParallelConcurrency,
      min: 1,
      max: 10,
      defaultValue: 5
    });
    normalizeInput({
      key: NodeInputKeyEnum.batchParallelRetryTimes,
      min: 0,
      max: 5,
      defaultValue: 3
    });
  }, [flowNodeType, inputs, nodeId, onChangeNode]);

  useEffect(() => {
    if (flowNodeType !== FlowNodeTypeEnum.batch) return;

    const expectedConcurrency = [
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.reference
    ] as const;
    const concurrencyInput = inputs.find(
      (i) => i.key === NodeInputKeyEnum.batchParallelConcurrency
    );
    if (concurrencyInput) {
      const list = concurrencyInput.renderTypeList || [];
      const matches =
        list.length === expectedConcurrency.length &&
        list.every((t, i) => t === expectedConcurrency[i]);
      if (!matches) {
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: NodeInputKeyEnum.batchParallelConcurrency,
          value: {
            ...concurrencyInput,
            renderTypeList: [...expectedConcurrency],
            selectedTypeIndex: Math.min(Math.max(concurrencyInput.selectedTypeIndex ?? 0, 0), 1)
          }
        });
      }
    }

    const expectedRetry = [FlowNodeInputTypeEnum.numberInput] as const;
    const retryInput = inputs.find((i) => i.key === NodeInputKeyEnum.batchParallelRetryTimes);
    if (retryInput) {
      const list = retryInput.renderTypeList || [];
      const matches = list.length === expectedRetry.length && list[0] === expectedRetry[0];
      if (!matches) {
        const num = Math.floor(Number(retryInput.value));
        const nextValue = Number.isFinite(num) ? Math.max(0, Math.min(5, num)) : 3;
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: NodeInputKeyEnum.batchParallelRetryTimes,
          value: {
            ...retryInput,
            renderTypeList: [...expectedRetry],
            selectedTypeIndex: 0,
            value: nextValue
          }
        });
      }
    }
  }, [flowNodeType, inputs, nodeId, onChangeNode]);

  // Update childrenNodeIdList
  const childrenNodeIdList = useMemoEnhance(() => {
    return getNodeList()
      .filter((node) => node.parentNodeId === nodeId)
      .map((node) => node.nodeId);
  }, [nodeId, getNodeList, nodeAmount]);
  useEffect(() => {
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: NodeInputKeyEnum.childrenNodeIdList,
      value: {
        ...Input_Template_Children_Node_List,
        value: childrenNodeIdList
      }
    });
    resetParentNodeSizeAndPosition(nodeId);
  }, [childrenNodeIdList, nodeId, onChangeNode, resetParentNodeSizeAndPosition]);

  // Update loop node offset value
  const inputBoxRef = useRef<HTMLDivElement>(null);
  const size = useSize(inputBoxRef);
  useEffect(() => {
    if (!size?.height) return;

    onChangeNode({
      nodeId,
      type: 'replaceInput',
      key: NodeInputKeyEnum.loopNodeInputHeight,
      value: {
        ...loopNodeInputHeight,
        value: size.height
      }
    });

    setTimeout(() => {
      resetParentNodeSizeAndPosition(nodeId);
    }, 50);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size?.height]);

  return (
    <NodeCard selected={selected} maxW="full" menuForbid={{ copy: true }} {...data}>
      <Container position={'relative'} flex={1}>
        <IOTitle text={t('common:Input')} />

        <Box mb={6} maxW={'500px'} ref={inputBoxRef}>
          <RenderInput nodeId={nodeId} flowInputList={inputs} />
        </Box>

        <>
          <FormLabel required fontWeight={'medium'} mb={3} color={'myGray.600'}>
            {flowNodeType === FlowNodeTypeEnum.batch
              ? t('workflow:execution_logic')
              : t('workflow:loop_body')}
          </FormLabel>
          <Box
            flex={1}
            position={'relative'}
            border={'base'}
            bg={'myGray.50'}
            rounded={'8px'}
            {...(!isFolded && {
              minW: nodeWidth,
              minH: nodeHeight
            })}
          >
            {/* <Background color="#A4A4A4" gap={60} size={3} /> */}
          </Box>
        </>
      </Container>
      <Container>
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeLoop);
