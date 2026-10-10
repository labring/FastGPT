import React, { useCallback } from 'react';
import NodeCard from '../render/NodeCard';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex } from '@chakra-ui/react';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type NodeProps, Position } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import {
  createIfElseBranchId,
  getIfElseBranchHandleKey
} from '@fastgpt/global/core/workflow/template/system/ifElse/utils';
import Container from '../../components/Container';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag/index';
import { MySourceHandle } from '../render/Handle';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import ListItem from './ListItem';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getOutputDisconnectCommands } from '@/web/core/workflow/utils';
import { useField } from '@/web/core/workflow/editor/react/useField';
import { useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { useWorkflowSnapshotGetter } from '../render/useWorkflowDocument';
import { WorkflowFieldScope } from '@/web/core/workflow/editor/WorkflowFieldScope';

/** ELSE 分支源柄的平移量：模块级常量，避免每次渲染换数组身份打穿 MySourceHandle 的 React.memo。 */
const elseHandleTranslate = [18, 0] as [number, number];

const NodeIfElse = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId } = data;

  return (
    <NodeCard selected={selected} maxW={'1000px'} {...data}>
      <IfElseEditor nodeId={nodeId} />
    </NodeCard>
  );
};

const IfElseEditor = ({ nodeId }: { nodeId: string }) => {
  const { t } = useTranslation();
  const nodeActions = useNodeActions(nodeId);
  // 边集合只在删除分支的回调里读，走非订阅 getter：点击时取当前值，组件不订阅结构变更。
  const { getEdges } = useWorkflowActions();
  const getWorkflow = useWorkflowSnapshotGetter();
  const ifElseListInput = useField(
    nodeId,
    NodeInputKeyEnum.ifElseList,
    'input',
    (field) => field?.data.input
  );
  const elseHandleId = getHandleId(nodeId, 'source', IfElseResultEnum.ELSE);
  const ifElseList = (ifElseListInput?.value as IfElseListItemType[] | undefined) ?? [];

  // 单分支时 ListItem 不渲染拖拽手柄，必须显式禁用拖拽，否则 rbd 会抛 "Unable to find drag handle"。
  const canDrag = ifElseList.length > 1;

  /** 分支列表整体就是 ifElseList 字段的值：增删改都按完整数组提交，一次交互一条历史。 */
  const onUpdateIfElseList = useCallback(
    (value: IfElseListItemType[]) => {
      nodeActions?.updateNode((current) => ({
        inputs: current.inputs.map((input) =>
          input.key === NodeInputKeyEnum.ifElseList ? { ...input, value } : input
        )
      }));
    },
    [nodeActions]
  );

  const onUpdateBranch = useCallback(
    (conditionIndex: number, update: (branch: IfElseListItemType) => IfElseListItemType) => {
      nodeActions?.updateNode((current) => {
        const input = current.inputs.find((item) => item.key === NodeInputKeyEnum.ifElseList);
        if (!input) return {};
        const list = (input.value as unknown as IfElseListItemType[]) ?? [];
        const nextList = list.map((branch, index) =>
          index === conditionIndex ? update(branch) : branch
        );
        return {
          inputs: current.inputs.map((item) =>
            item.key === NodeInputKeyEnum.ifElseList ? { ...item, value: nextList } : item
          )
        };
      });
    },
    [nodeActions]
  );

  /**
   * 删除分支：分支 handle 上的连线必须和分支记录在同一事务里消失，
   * 否则撤销要按两下才能还原一次删除。
   */
  const onDeleteBranch = useCallback(
    (conditionIndex: number) => {
      const branch = (
        getWorkflow()
          ?.nodes.find((node) => node.nodeId === nodeId)
          ?.inputs.find((input) => input.key === NodeInputKeyEnum.ifElseList)?.value as unknown as
          | IfElseListItemType[]
          | undefined
      )?.[conditionIndex];
      if (!branch) return;

      nodeActions?.updateNode(
        (current) => {
          const input = current.inputs.find((item) => item.key === NodeInputKeyEnum.ifElseList);
          if (!input) return {};
          const list = (input.value as unknown as IfElseListItemType[]) ?? [];
          return {
            inputs: current.inputs.map((item) =>
              item.key === NodeInputKeyEnum.ifElseList
                ? { ...item, value: list.filter((_, index) => index !== conditionIndex) }
                : item
            )
          };
        },
        {
          disconnectEdges: getOutputDisconnectCommands({
            edges: getEdges(),
            nodeId,
            outputKey: getIfElseBranchHandleKey(branch, conditionIndex)
          })
        }
      );
    },
    [getEdges, getWorkflow, nodeActions, nodeId]
  );

  return (
    <Flex flexDirection={'column'} cursor={'default'}>
      <DndDrag<IfElseListItemType>
        onDragEndCb={(list: IfElseListItemType[]) => onUpdateIfElseList(list)}
        dataList={ifElseList}
        renderClone={(provided, snapshot, rubric) => (
          <WorkflowFieldScope nodeId={nodeId} fieldKey={NodeInputKeyEnum.ifElseList}>
            <ListItem
              provided={provided}
              snapshot={snapshot}
              conditionItem={ifElseList[rubric.source.index]}
              conditionIndex={rubric.source.index}
              branchCount={ifElseList.length}
              onUpdateBranch={onUpdateBranch}
              onDeleteBranch={onDeleteBranch}
              nodeId={nodeId}
            />
          </WorkflowFieldScope>
        )}
      >
        {({ provided }) => (
          <Box {...provided.droppableProps} ref={provided.innerRef}>
            {ifElseList.map((conditionItem, conditionIndex) => (
              <Draggable
                key={getIfElseBranchHandleKey(conditionItem, conditionIndex)}
                draggableId={getIfElseBranchHandleKey(conditionItem, conditionIndex)}
                index={conditionIndex}
                isDragDisabled={!canDrag}
              >
                {(provided, snapshot) => (
                  <WorkflowFieldScope nodeId={nodeId} fieldKey={NodeInputKeyEnum.ifElseList}>
                    <ListItem
                      provided={provided}
                      snapshot={snapshot}
                      conditionItem={conditionItem}
                      conditionIndex={conditionIndex}
                      branchCount={ifElseList.length}
                      onUpdateBranch={onUpdateBranch}
                      onDeleteBranch={onDeleteBranch}
                      nodeId={nodeId}
                    />
                  </WorkflowFieldScope>
                )}
              </Draggable>
            ))}
          </Box>
        )}
      </DndDrag>

      <Container position={'relative'}>
        <Flex alignItems={'center'}>
          <Box color={'black'} fontSize={'md'} ml={2}>
            {IfElseResultEnum.ELSE}
          </Box>
          <MySourceHandle
            nodeId={nodeId}
            handleId={elseHandleId}
            position={Position.Right}
            translate={elseHandleTranslate}
          />
        </Flex>
      </Container>
      <Box py={3} px={4}>
        <Button
          variant={'whiteBase'}
          w={'full'}
          leftIcon={<MyIcon name={'common/addLight'} boxSize={4} mr={-1} />}
          onClick={() => {
            onUpdateIfElseList([
              ...ifElseList,
              {
                branchId: createIfElseBranchId(),
                condition: 'AND',
                list: [
                  {
                    variable: undefined,
                    condition: undefined,
                    value: undefined,
                    valueType: 'input'
                  }
                ]
              }
            ]);
          }}
        >
          {t('common:core.module.input.Add Branch')}
        </Button>
      </Box>
    </Flex>
  );
};
export default React.memo(NodeIfElse);
