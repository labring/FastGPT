import React, { useCallback, useMemo } from 'react';
import NodeCard from '../render/NodeCard';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex } from '@chakra-ui/react';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type NodeProps, Position } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import Container from '../../components/Container';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag/index';
import { MySourceHandle } from '../render/Handle';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import ListItem from './ListItem';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';

const NodeIfElse = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs = [] } = data;
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const elseHandleId = getHandleId(nodeId, 'source', IfElseResultEnum.ELSE);

  const ifElseList = useMemo(
    () =>
      (inputs.find((input) => input.key === NodeInputKeyEnum.ifElseList)
        ?.value as IfElseListItemType[]) || [],
    [inputs]
  );

  const onUpdateIfElseList = useCallback(
    (value: IfElseListItemType[]) => {
      const ifElseListInput = inputs.find((input) => input.key === NodeInputKeyEnum.ifElseList);
      if (!ifElseListInput) return;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.ifElseList,
        value: {
          ...ifElseListInput,
          value
        }
      });
    },
    [inputs, nodeId, onChangeNode]
  );

  return (
    <NodeCard selected={selected} maxW={'1000px'} {...data}>
      <Flex flexDirection={'column'} cursor={'default'}>
        <DndDrag<IfElseListItemType>
          onDragEndCb={(list: IfElseListItemType[]) => onUpdateIfElseList(list)}
          dataList={ifElseList}
          renderClone={(provided, snapshot, rubric) => (
            <ListItem
              provided={provided}
              snapshot={snapshot}
              conditionItem={ifElseList[rubric.source.index]}
              conditionIndex={rubric.source.index}
              ifElseList={ifElseList}
              onUpdateIfElseList={onUpdateIfElseList}
              nodeId={nodeId}
            />
          )}
        >
          {({ provided }) => (
            <Box {...provided.droppableProps} ref={provided.innerRef}>
              {ifElseList.map((conditionItem, conditionIndex) => (
                <Draggable
                  key={conditionIndex}
                  draggableId={conditionIndex.toString()}
                  index={conditionIndex}
                >
                  {(provided, snapshot) => (
                    <ListItem
                      provided={provided}
                      snapshot={snapshot}
                      conditionItem={conditionItem}
                      conditionIndex={conditionIndex}
                      ifElseList={ifElseList}
                      onUpdateIfElseList={onUpdateIfElseList}
                      nodeId={nodeId}
                    />
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
              translate={[18, 0]}
            />
          </Flex>
        </Container>
      </Flex>
      <Box py={3} px={4}>
        <Button
          variant={'whiteBase'}
          w={'full'}
          leftIcon={<MyIcon name={'common/addLight'} boxSize={4} mr={-1} />}
          onClick={() => {
            const ifElseListInput = inputs.find(
              (input) => input.key === NodeInputKeyEnum.ifElseList
            );
            if (!ifElseListInput) return;

            onUpdateIfElseList([
              ...ifElseList,
              {
                condition: 'AND',
                list: [
                  {
                    variable: undefined,
                    condition: undefined,
                    value: undefined
                  }
                ]
              }
            ]);
          }}
        >
          {t('common:core.module.input.Add Branch')}
        </Button>
      </Box>
    </NodeCard>
  );
};
export default React.memo(NodeIfElse);
