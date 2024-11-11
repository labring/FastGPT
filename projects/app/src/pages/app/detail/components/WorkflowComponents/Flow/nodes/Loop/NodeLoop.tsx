/*
  The loop node has controllable width and height properties, which serve as the parent node of loopFlow.
  When the childNodes of loopFlow change, it automatically calculates the rectangular width, height, and position of the childNodes, 
  thereby further updating the width and height properties of the loop node.
*/

import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useEffect, useMemo, useRef } from 'react';
import { Background, NodeProps } from 'reactflow';
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
  Input_Template_Children_Node_List,
  Input_Template_LOOP_NODE_OFFSET
} from '@fastgpt/global/core/workflow/template/input';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { AppContext } from '../../../../context';
import { isValidArrayReferenceValue } from '@fastgpt/global/core/workflow/utils';
import { ReferenceArrayValueType } from '@fastgpt/global/core/workflow/type/io';
import { useWorkflow } from '../../hooks/useWorkflow';
import { useSize } from 'ahooks';

const NodeLoop = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs, isFolded } = data;
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const { resetParentNodeSizeAndPosition } = useWorkflow();

  const {
    nodeWidth,
    nodeHeight,
    loopInputArray,
    loopNodeInputHeight = Input_Template_LOOP_NODE_OFFSET
  } = useMemo(() => {
    return {
      nodeWidth: inputs.find((input) => input.key === NodeInputKeyEnum.nodeWidth)?.value,
      nodeHeight: inputs.find((input) => input.key === NodeInputKeyEnum.nodeHeight)?.value,
      loopInputArray: inputs.find((input) => input.key === NodeInputKeyEnum.loopInputArray),
      loopNodeInputHeight: inputs.find(
        (input) => input.key === NodeInputKeyEnum.loopNodeInputHeight
      )
    };
  }, [inputs]);

  // Update array input type
  // Computed the reference value type
  const newValueType = useMemo(() => {
    if (!loopInputArray) return WorkflowIOValueTypeEnum.arrayAny;
    const value = loopInputArray.value as ReferenceArrayValueType;

    if (
      !value ||
      value.length === 0 ||
      !isValidArrayReferenceValue(
        value,
        nodeList.map((node) => node.nodeId)
      )
    )
      return WorkflowIOValueTypeEnum.arrayAny;

    const globalVariables = getWorkflowGlobalVariables({
      nodes: nodeList,
      chatConfig: appDetail.chatConfig
    });

    const valueType = ((value) => {
      if (value?.[0] === VARIABLE_NODE_ID) {
        return globalVariables.find((item) => item.key === value[1])?.valueType;
      } else {
        const node = nodeList.find((node) => node.nodeId === value?.[0]);
        const output = node?.outputs.find((output) => output.id === value?.[1]);
        return output?.valueType;
      }
    })(value[0]);
    return ArrayTypeMap[valueType as keyof typeof ArrayTypeMap] ?? WorkflowIOValueTypeEnum.arrayAny;
  }, [appDetail.chatConfig, loopInputArray, nodeList]);
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
  }, [newValueType]);

  // Update childrenNodeIdList
  const childrenNodeIdList = useMemo(() => {
    return JSON.stringify(
      nodeList.filter((node) => node.parentNodeId === nodeId).map((node) => node.nodeId)
    );
  }, [nodeId, nodeList]);
  useEffect(() => {
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: NodeInputKeyEnum.childrenNodeIdList,
      value: {
        ...Input_Template_Children_Node_List,
        value: JSON.parse(childrenNodeIdList)
      }
    });
    resetParentNodeSizeAndPosition(nodeId);
  }, [childrenNodeIdList]);

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
  }, [size?.height]);

  const Render = useMemo(() => {
    return (
      <NodeCard selected={selected} maxW="full" menuForbid={{ copy: true }} {...data}>
        <Container position={'relative'} flex={1}>
          <IOTitle text={t('common:common.Input')} />
          <Box mb={6} maxW={'500px'} ref={inputBoxRef}>
            <RenderInput nodeId={nodeId} flowInputList={inputs} />
          </Box>
          <FormLabel required fontWeight={'medium'} mb={3} color={'myGray.600'}>
            {t('workflow:loop_body')}
          </FormLabel>
          <Box
            flex={1}
            position={'relative'}
            border={'base'}
            bg={'myGray.100'}
            rounded={'8px'}
            {...(!isFolded && {
              minW: nodeWidth,
              minH: nodeHeight
            })}
          >
            <Background />
          </Box>
        </Container>
        <Container>
          <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
        </Container>
      </NodeCard>
    );
  }, [selected, isFolded, nodeWidth, nodeHeight, data, t, nodeId, inputs, outputs]);

  return Render;
};

export default React.memo(NodeLoop);
