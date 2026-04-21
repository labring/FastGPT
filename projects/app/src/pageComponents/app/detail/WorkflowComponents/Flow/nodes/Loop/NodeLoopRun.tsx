/*
  LoopRun container node. Runtime isolation lives in dispatchLoopRun on the
  server. Layout follows NodeCode's bottom-output pattern:

    Input area:
      - loopRunMode select
      - loopRunInputArray (array mode only)
      - loop body (nested sub-workflow canvas)

    Output area:
      - IOTitle with catchError toggle on the right
      - loopCustomOutputs declaration block (DynamicInputs renders each field
        as variable-name / reference / value-type)
      - Success outputs (dynamic user fields)
      - CatchError block below when catchError is enabled
*/
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useEffect, useMemo, useRef } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import Container from '../../components/Container';
import IOTitle from '../../components/IOTitle';
import { useTranslation } from 'next-i18next';
import RenderInput from '../render/RenderInput';
import { Box } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import RenderOutput from '../render/RenderOutput';
import CatchError from '../render/RenderOutput/CatchError';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { LoopRunBreakNode as LoopRunBreakTemplate } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunBreak';
import { useNestedNode } from '../../hooks/useNestedNode';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { WorkflowUtilsContext } from '../../../context/workflowUtilsContext';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import { WorkflowInitContext } from '../../../context/workflowInitContext';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

const NodeLoopRun = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs, isFolded, catchError } = data;
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const splitOutput = useContextSelector(WorkflowUtilsContext, (v) => v.splitOutput);
  const { getNodeById, childNodeIds, setNodes } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => ({
      getNodeById: v.getNodeById,
      childNodeIds: v.childrenNodeIdListMap[nodeId] ?? [],
      setNodes: v.setNodes
    })
  );
  const getRawNodeById = useContextSelector(WorkflowInitContext, (v) => v.getRawNodeById);

  const mode =
    (inputs.find((i) => i.key === NodeInputKeyEnum.loopRunMode)?.value as
      | LoopRunModeEnum
      | undefined) ?? LoopRunModeEnum.array;

  // In conditional mode no array input exists — pass undefined to skip
  // valueType inference inside the shared hook.
  const arrayInputKey =
    mode === LoopRunModeEnum.array ? NodeInputKeyEnum.loopRunInputArray : undefined;

  const { nodeWidth, nodeHeight, inputBoxRef } = useNestedNode({ nodeId, inputs, arrayInputKey });

  // Inputs shown in the top Input area. Excludes loopCustomOutputs (moved to
  // Output area) and any canEdit declaration items (rendered by the
  // declaration block). In conditional mode the array input is also hidden.
  const inputAreaInputs = useMemo(
    () =>
      inputs.filter((i) => {
        if (i.key === NodeInputKeyEnum.loopCustomOutputs) return false;
        if (i.canEdit) return false;
        if (mode !== LoopRunModeEnum.array && i.key === NodeInputKeyEnum.loopRunInputArray) {
          return false;
        }
        return true;
      }),
    [inputs, mode]
  );

  // Inputs fed to the declaration block: the loopCustomOutputs addInputParam
  // button plus all canEdit items. DynamicInputs reads this list to render
  // each declared field.
  const outputDeclarationInputs = useMemo(
    () => inputs.filter((i) => i.key === NodeInputKeyEnum.loopCustomOutputs || !!i.canEdit),
    [inputs]
  );

  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitOutput(outputs),
    [splitOutput, outputs]
  );

  // ── Mode-driven sync: update loopRunStart's outputs + auto-add loopRunBreak
  //
  // We run this from the container (not NodeLoopRunStart) because the start
  // node doesn't reliably re-render on parent mode changes. The container
  // owns the mode input and is always re-rendered when it changes.
  const prevModeRef = useRef<LoopRunModeEnum>(mode);
  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = mode;

    const startChildId = childNodeIds.find(
      (id) => getNodeById(id)?.flowNodeType === FlowNodeTypeEnum.loopRunStart
    );
    const startNode = startChildId ? getNodeById(startChildId) : undefined;

    if (startNode) {
      const hasIndex = startNode.outputs.some((o) => o.key === NodeOutputKeyEnum.currentIndex);
      const hasItem = startNode.outputs.some((o) => o.key === NodeOutputKeyEnum.currentItem);
      const hasIteration = startNode.outputs.some(
        (o) => o.key === NodeOutputKeyEnum.currentIteration
      );

      if (mode === LoopRunModeEnum.array) {
        if (hasIteration) {
          onChangeNode({
            nodeId: startNode.nodeId,
            type: 'delOutput',
            key: NodeOutputKeyEnum.currentIteration
          });
        }
        if (!hasIndex) {
          onChangeNode({
            nodeId: startNode.nodeId,
            type: 'addOutput',
            value: {
              id: NodeOutputKeyEnum.currentIndex,
              key: NodeOutputKeyEnum.currentIndex,
              label: t('workflow:current_index'),
              description: t('workflow:current_index_desc'),
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.number
            }
          });
        }
        if (!hasItem) {
          onChangeNode({
            nodeId: startNode.nodeId,
            type: 'addOutput',
            value: {
              id: NodeOutputKeyEnum.currentItem,
              key: NodeOutputKeyEnum.currentItem,
              label: t('workflow:current_item'),
              description: t('workflow:current_item_desc'),
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.any
            }
          });
        }
      } else {
        if (hasIndex) {
          onChangeNode({
            nodeId: startNode.nodeId,
            type: 'delOutput',
            key: NodeOutputKeyEnum.currentIndex
          });
        }
        if (hasItem) {
          onChangeNode({
            nodeId: startNode.nodeId,
            type: 'delOutput',
            key: NodeOutputKeyEnum.currentItem
          });
        }
        if (!hasIteration) {
          onChangeNode({
            nodeId: startNode.nodeId,
            type: 'addOutput',
            value: {
              id: NodeOutputKeyEnum.currentIteration,
              key: NodeOutputKeyEnum.currentIteration,
              label: t('workflow:current_iteration'),
              description: t('workflow:current_iteration_desc'),
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.number
            }
          });
        }
      }
    }

    // Auto-add a loopRunBreak node when user switches INTO conditional mode
    // without an existing break (only on transition — avoids re-adding every
    // time the user deletes the break node intentionally).
    if (mode === LoopRunModeEnum.conditional && prevMode !== LoopRunModeEnum.conditional) {
      const hasBreak = childNodeIds.some(
        (id) => getNodeById(id)?.flowNodeType === FlowNodeTypeEnum.loopRunBreak
      );
      if (!hasBreak) {
        const startRaw = startChildId ? getRawNodeById(startChildId) : undefined;
        const position = startRaw?.position
          ? { x: startRaw.position.x + 500, y: startRaw.position.y + 150 }
          : { x: 500, y: 400 };
        const breakNode = nodeTemplate2FlowNode({
          template: LoopRunBreakTemplate,
          position,
          parentNodeId: nodeId,
          t
        });
        setNodes((state) => state.concat(breakNode));
      }
    }
  }, [mode, childNodeIds, nodeId, getNodeById, getRawNodeById, onChangeNode, setNodes, t]);

  // Mirror canEdit inputs → dynamic outputs (add / update / remove) so
  // downstream nodes can reference each declared field.
  useEffect(() => {
    const declared = inputs.filter((i) => i.canEdit === true);
    const currentDynamic = outputs.filter((o) => o.type === FlowNodeOutputTypeEnum.dynamic);
    const declaredKeys = new Set(declared.map((i) => i.key));

    currentDynamic.forEach((o) => {
      if (!declaredKeys.has(o.key)) {
        onChangeNode({ nodeId, type: 'delOutput', key: o.key });
      }
    });

    declared.forEach((input) => {
      const existing = currentDynamic.find((o) => o.key === input.key);
      if (!existing) {
        onChangeNode({
          nodeId,
          type: 'addOutput',
          value: {
            id: input.key,
            key: input.key,
            label: input.label || input.key,
            type: FlowNodeOutputTypeEnum.dynamic,
            valueType: input.valueType
          }
        });
      } else if (
        existing.valueType !== input.valueType ||
        existing.label !== (input.label || input.key)
      ) {
        onChangeNode({
          nodeId,
          type: 'updateOutput',
          key: input.key,
          value: {
            ...existing,
            label: input.label || input.key,
            valueType: input.valueType
          }
        });
      }
    });
  }, [inputs, outputs, nodeId, onChangeNode]);

  return (
    <NodeCard selected={selected} maxW="full" menuForbid={{ copy: true }} {...data}>
      <Container position={'relative'} flex={1}>
        <IOTitle text={t('common:Input')} />

        <Box mb={6} maxW={'500px'} ref={inputBoxRef}>
          <RenderInput nodeId={nodeId} flowInputList={inputAreaInputs} />
        </Box>

        <>
          <FormLabel required fontWeight={'medium'} mb={3} color={'myGray.600'}>
            {t('workflow:loop_body')}
          </FormLabel>
          <Box
            flex={1}
            position={'relative'}
            border={'base'}
            rounded={'8px'}
            {...(!isFolded && {
              minW: nodeWidth,
              minH: nodeHeight
            })}
          />
        </>
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
        <Box>
          <RenderInput nodeId={nodeId} flowInputList={outputDeclarationInputs} />
        </Box>
        <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
      </Container>
      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}
    </NodeCard>
  );
};

export default React.memo(NodeLoopRun);
