import React, { useMemo } from 'react';
import { type NodeProps, Position, useViewport } from 'reactflow';
import { Box, Button, HStack, Input } from '@chakra-ui/react';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MySourceHandle } from './render/Handle';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { type UserSelectOptionItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import IOTitle from '../components/IOTitle';
import RenderOutput from './render/RenderOutput';
import DndDrag, {
  Draggable,
  type DraggableProvided,
  type DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';

const NodeUserSelect = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const { zoom } = useViewport();

  const CustomComponent = useMemo(
    () => ({
      [NodeInputKeyEnum.userSelectOptions]: (v: FlowNodeInputItemType) => {
        const { key: optionKey, value, ...props } = v;
        const options = value as UserSelectOptionItemType[];

        return (
          <Box>
            <DndDrag<UserSelectOptionItemType>
              onDragEndCb={(list) => {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: optionKey,
                  value: {
                    ...props,
                    key: optionKey,
                    value: list
                  }
                });
              }}
              dataList={options}
              renderClone={(provided, snapshot, rubric) => (
                <OptionItem
                  provided={provided}
                  snapshot={snapshot}
                  item={options[rubric.source.index]}
                  nodeId={nodeId}
                  itemValue={v}
                  index={rubric.source.index}
                />
              )}
              zoom={zoom}
            >
              {({ provided }) => (
                <Box ref={provided.innerRef} {...provided.droppableProps}>
                  {options.map((item, i) => (
                    <Draggable key={item.key} index={i} draggableId={item.key}>
                      {(provided, snapshot) => (
                        <OptionItem
                          provided={provided}
                          snapshot={snapshot}
                          item={item}
                          nodeId={nodeId}
                          itemValue={v}
                          index={i}
                          key={item.key}
                        />
                      )}
                    </Draggable>
                  ))}
                </Box>
              )}
            </DndDrag>
            <Button
              fontSize={'sm'}
              leftIcon={<MyIcon name={'common/addLight'} w={4} />}
              onClick={() => {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: optionKey,
                  value: {
                    ...props,
                    key: optionKey,
                    value: options.concat({ value: '', key: getNanoid() })
                  }
                });
              }}
            >
              {t('common:core.module.Add_option')}
            </Button>
          </Box>
        );
      }
    }),
    [nodeId, onChangeNode, t, zoom]
  );

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container>
        <RenderInput nodeId={nodeId} flowInputList={inputs} CustomComponent={CustomComponent} />
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeUserSelect);

const OptionItem = ({
  provided,
  snapshot,
  item,
  nodeId,
  itemValue,
  index
}: {
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  item: UserSelectOptionItemType;
  nodeId: string;
  itemValue: FlowNodeInputItemType;
  index: number;
}) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const { key: optionKey, value, ...props } = itemValue;
  const options = value as UserSelectOptionItemType[];

  return (
    <Box
      mb={4}
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
    >
      <HStack spacing={1} {...provided.dragHandleProps}>
        <MyTooltip label={t('common:Delete')}>
          <MyIcon
            mt={0.5}
            name={'circleMinus'}
            w={'0.8rem'}
            cursor={'pointer'}
            color={'myGray.600'}
            _hover={{ color: 'red.600' }}
            onClick={() => {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: optionKey,
                value: {
                  ...props,
                  key: optionKey,
                  value: options.filter((input) => input.key !== item.key)
                }
              });
            }}
          />
        </MyTooltip>
        <Box color={'myGray.600'} fontWeight={'medium'} fontSize={'sm'}>
          {t('common:option') + (index + 1)}
        </Box>
      </HStack>
      <Box position={'relative'} mt={1}>
        <Input
          defaultValue={item.value}
          bg={'white'}
          fontSize={'sm'}
          onChange={(e) => {
            const newVal = options.map((val) =>
              val.key === item.key
                ? {
                    ...val,
                    value: e.target.value
                  }
                : val
            );
            onChangeNode({
              nodeId,
              type: 'updateInput',
              key: optionKey,
              value: {
                ...props,
                key: optionKey,
                value: newVal
              }
            });
          }}
        />
        {!snapshot.isDragging && (
          <MySourceHandle
            nodeId={nodeId}
            handleId={getHandleId(nodeId, 'source', item.key)}
            position={Position.Right}
            translate={[34, 0]}
          />
        )}
      </Box>
    </Box>
  );
};
