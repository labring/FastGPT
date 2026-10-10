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
import {
  getOutputDisconnectCommands,
  nodeTemplate2FlowNode,
  splitNodeOutputs
} from '@/web/core/workflow/utils';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflow, useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { canvasNodeToStoreNode } from '@/web/core/workflow/editor/canvas/canvasTypes';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import { useDocumentGetNodeById } from '../render/useWorkflowDocument';
import isEqual from 'lodash-es/isEqual';

const emptyInputs: WorkflowNodeData['inputs'] = [];
const emptyOutputs: WorkflowNodeData['outputs'] = [];

const NodeLoopRun = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId } = data;
  const node = useNode<WorkflowNodeData>(nodeId, { raw: true });
  const inputs = node?.data.inputs ?? emptyInputs;
  const outputs = node?.data.outputs ?? emptyOutputs;
  const catchError = node?.data.catchError ?? false;
  const isFolded = node?.view.isFolded ?? false;
  const nodeActions = useNodeActions(nodeId);
  /**
   * 容器要按类型找子节点（起始/中断）：结构快照没有 flowNodeType，按 id 查节点走 port 的
   * getNode（非订阅），子节点列表走 Runtime 图查询的 byParent 索引。
   * getChildNodeIds 在同一结构版本内返回同一个数组对象，所以与容器无关的语义变更不会让
   * 下面的 memo 与 mode 同步 effect 重跑。
   */
  const getNodeById = useDocumentGetNodeById();
  const childNodeIds = useWorkflow((_structure, graph) => graph.getChildNodeIds(nodeId));
  // 建中断节点是写命令，边集合只在两个回调/effect 里按点击时的当前值读：
  // 都走稳定 action 句柄，容器不订阅结构通道（06a-5 A 类 + B 类）。
  const { addNode, getEdges } = useWorkflowActions();
  // flowNodeType 在节点生命周期内不变，因此只在子节点集合变化时重算。
  const startChildId = useMemo(
    () =>
      childNodeIds.find((id) => getNodeById(id)?.flowNodeType === FlowNodeTypeEnum.loopRunStart),
    [childNodeIds, getNodeById]
  );
  // 起始节点的输出集合与位置都由容器代管：位置读 node view，不再取画布原始节点。
  const startChildIdOrEmpty = startChildId ?? '';
  const startChildPosition = useNode(startChildIdOrEmpty, (current) => current?.view.position);
  const startChildActions = useNodeActions(startChildIdOrEmpty);
  const startOutputs = useNode<FlowNodeItemType['outputs']>(
    startChildIdOrEmpty,
    (current) => current?.data.outputs
  );

  const mode =
    (inputs.find((i) => i.key === NodeInputKeyEnum.loopRunMode)?.value as
      | LoopRunModeEnum
      | undefined) ?? LoopRunModeEnum.array;

  // Conditional mode has no array input; skip valueType inference in the hook.
  const arrayInputKey =
    mode === LoopRunModeEnum.array ? NodeInputKeyEnum.loopRunInputArray : undefined;

  const { nodeWidth, nodeHeight, inputBoxRef } = useNestedNode({ nodeId, inputs, arrayInputKey });

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

  const outputDeclarationInputs = useMemo(
    () => inputs.filter((i) => i.key === NodeInputKeyEnum.loopCustomOutputs || !!i.canEdit),
    [inputs]
  );

  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitNodeOutputs(outputs),
    [outputs]
  );

  // Mode sync is owned by the container, not the start node, because the start
  // node doesn't re-render reliably when the parent's mode input changes.
  const prevModeRef = useRef<LoopRunModeEnum>(mode);
  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = mode;

    if (startChildId && startOutputs) {
      const hasKey = (key: NodeOutputKeyEnum) => startOutputs.some((o) => o.key === key);

      // Store i18n keys so downstream `t(label)` stays reactive.
      const indexOutput = {
        id: NodeOutputKeyEnum.currentIndex,
        key: NodeOutputKeyEnum.currentIndex,
        label: i18nT('workflow:current_index'),
        description: i18nT('workflow:current_index_desc'),
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.number
      };
      const itemOutput = {
        id: NodeOutputKeyEnum.currentItem,
        key: NodeOutputKeyEnum.currentItem,
        label: i18nT('workflow:current_item'),
        description: i18nT('workflow:current_item_desc'),
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.any
      };
      const iterationOutput = {
        id: NodeOutputKeyEnum.currentIteration,
        key: NodeOutputKeyEnum.currentIteration,
        label: i18nT('workflow:current_iteration'),
        description: i18nT('workflow:current_iteration_desc'),
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.number
      };

      // 一次算出目标输出集合：逐条增删会把一次模式切换拆成多条历史。
      const nextOutputs =
        mode === LoopRunModeEnum.array
          ? [
              ...startOutputs.filter((o) => o.key !== NodeOutputKeyEnum.currentIteration),
              ...(hasKey(NodeOutputKeyEnum.currentIndex) ? [] : [indexOutput]),
              ...(hasKey(NodeOutputKeyEnum.currentItem) ? [] : [itemOutput])
            ]
          : [
              ...startOutputs.filter(
                (o) =>
                  o.key !== NodeOutputKeyEnum.currentIndex &&
                  o.key !== NodeOutputKeyEnum.currentItem
              ),
              ...(hasKey(NodeOutputKeyEnum.currentIteration) ? [] : [iterationOutput])
            ];

      if (!isEqual(nextOutputs, startOutputs)) {
        // 被删输出 handle 上的连线同事务断开；同一事务内逐条删边要按降序下标。
        const removedKeys = startOutputs
          .map((o) => o.key)
          .filter((key) => !nextOutputs.some((o) => o.key === key));
        startChildActions?.updateNode(() => ({ outputs: nextOutputs }), {
          disconnectEdges: removedKeys
            .flatMap((outputKey) =>
              getOutputDisconnectCommands({
                edges: getEdges(),
                nodeId: startChildId,
                outputKey
              })
            )
            .sort((a, b) => b.index - a.index)
        });
      }
    }

    // Transition-only, so a user-deleted break node isn't re-created.
    if (mode === LoopRunModeEnum.conditional && prevMode !== LoopRunModeEnum.conditional) {
      const hasBreak = childNodeIds.some(
        (id) => getNodeById(id)?.flowNodeType === FlowNodeTypeEnum.loopRunBreak
      );
      if (!hasBreak) {
        const startPosition = startChildPosition;
        const position = startPosition
          ? { x: startPosition.x + 500, y: startPosition.y + 150 }
          : { x: 500, y: 400 };
        const breakNode = nodeTemplate2FlowNode({
          template: LoopRunBreakTemplate,
          position,
          parentNodeId: nodeId,
          t
        });
        addNode(canvasNodeToStoreNode(breakNode));
      }
    }
  }, [
    addNode,
    childNodeIds,
    getEdges,
    getNodeById,
    mode,
    nodeId,
    startChildId,
    startChildActions,
    startChildPosition,
    startOutputs,
    t
  ]);

  useEffect(() => {
    // 声明的动态出参要与 outputs 对齐：一次算出目标数组单事务提交，被删出参的连线一起断开。
    const documentInputs = inputs;
    const documentOutputs = outputs;

    const declared = documentInputs.filter((i) => i.canEdit === true);
    const declaredKeys = new Set(declared.map((i) => i.key));
    const removedKeys = documentOutputs
      .filter((o) => o.type === FlowNodeOutputTypeEnum.dynamic && !declaredKeys.has(o.key))
      .map((o) => o.key);

    const keptOutputs = documentOutputs.filter((o) => !removedKeys.includes(o.key));
    const updatedOutputs = keptOutputs.map((o) => {
      const input = declared.find((i) => i.key === o.key);
      if (!input) return o;
      const label = input.label || input.key;
      // 只在真有差异时改写，避免与 Runtime 归一化后的记录反复互写。
      return o.label === label && o.valueType === input.valueType
        ? o
        : { ...o, label, valueType: input.valueType };
    });
    const addedOutputs = declared
      .filter((input) => !keptOutputs.some((o) => o.key === input.key))
      .map((input) => ({
        id: input.key,
        key: input.key,
        label: input.label || input.key,
        type: FlowNodeOutputTypeEnum.dynamic,
        valueType: input.valueType
      }));

    const changed =
      removedKeys.length > 0 ||
      addedOutputs.length > 0 ||
      updatedOutputs.some((o, index) => o !== keptOutputs[index]);
    if (!changed) return;

    nodeActions?.updateNode(() => ({ outputs: [...updatedOutputs, ...addedOutputs] }), {
      disconnectEdges: removedKeys
        .flatMap((outputKey) =>
          getOutputDisconnectCommands({ edges: getEdges(), nodeId, outputKey })
        )
        .sort((a, b) => b.index - a.index)
    });
  }, [getEdges, inputs, nodeActions, nodeId, outputs]);

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
            data-workflow-container-content="true"
            border={'base'}
            bg={'myGray.100'}
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
        <Box maxW={'600px'}>
          <RenderInput nodeId={nodeId} flowInputList={outputDeclarationInputs} />
        </Box>
        <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
      </Container>
      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}
    </NodeCard>
  );
};

export default React.memo(NodeLoopRun);
