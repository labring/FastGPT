import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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
import { type UserSelectOptionItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import IOTitle from '../components/IOTitle';
import RenderOutput from './render/RenderOutput';
import DndDrag, {
  Draggable,
  type DraggableProvided,
  type DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const referenceSourceHandleKey = 'ref_default';

const getOptionSourceHandleId = (nodeId: string, key: string) => getHandleId(nodeId, 'source', key);

const defaultManualOptions: UserSelectOptionItemType[] = [
  { value: 'Confirm', key: 'option1' },
  { value: 'Cancel', key: 'option2' }
];

const getDefaultManualOptions = () => defaultManualOptions.map((item) => ({ ...item }));

const NodeUserSelect = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const onDelEdge = useContextSelector(WorkflowActionsContext, (v) => v.onDelEdge);
  const { zoom } = useViewport();
  const previousRenderTypeRef = useRef<string>();

  const userSelectInput = useMemo(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.userSelectOptions),
    [inputs]
  );
  const currentRenderType =
    userSelectInput?.renderTypeList?.[userSelectInput.selectedTypeIndex || 0];

  useEffect(() => {
    if (!userSelectInput || !currentRenderType) return;

    const previousRenderType = previousRenderTypeRef.current;
    previousRenderTypeRef.current = currentRenderType;

    if (!previousRenderType || previousRenderType === currentRenderType) return;

    if (previousRenderType === FlowNodeInputTypeEnum.custom) {
      const previousOptions = Array.isArray(userSelectInput.value)
        ? (userSelectInput.value as UserSelectOptionItemType[])
        : [];

      previousOptions.forEach((item) => {
        onDelEdge({
          nodeId,
          sourceHandle: getOptionSourceHandleId(nodeId, item.key)
        });
      });
    }

    if (previousRenderType === FlowNodeInputTypeEnum.reference) {
      onDelEdge({
        nodeId,
        sourceHandle: getOptionSourceHandleId(nodeId, referenceSourceHandleKey)
      });
    }

    if (currentRenderType === FlowNodeInputTypeEnum.custom) {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.userSelectOptions,
        value: {
          ...userSelectInput,
          value: getDefaultManualOptions()
        }
      });
    }
  }, [currentRenderType, nodeId, onChangeNode, onDelEdge, userSelectInput]);

  const CustomComponent = useMemo(
    () => ({
      // selectedTypeIndex=0 (custom) 时渲染拖拽选项列表（手动输入模式）
      // selectedTypeIndex=1 (reference) 时由 RenderInput 内置 Reference 组件接管
      [NodeInputKeyEnum.userSelectOptions]: (v: FlowNodeInputItemType) => {
        const renderType = v.renderTypeList?.[v.selectedTypeIndex || 0];
        if (renderType !== FlowNodeInputTypeEnum.custom) {
          return null;
        }

        const { key: optionKey, value, ...props } = v;
        const rawOptions = value as UserSelectOptionItemType[];
        const options = rawOptions ?? defaultManualOptions;

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
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const onDelEdge = useContextSelector(WorkflowActionsContext, (v) => v.onDelEdge);
  const { key: optionKey, value, ...props } = itemValue;
  const options = (value as UserSelectOptionItemType[]) ?? defaultManualOptions;

  const updateOptionValue = useCallback(
    (newValue: string) => {
      const newVal = options.map((val) =>
        val.key === item.key ? { ...val, value: newValue } : val
      );
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: optionKey,
        value: { ...props, key: optionKey, value: newVal }
      });
    },
    [item.key, nodeId, onChangeNode, optionKey, options, props]
  );

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
              onDelEdge({
                nodeId,
                sourceHandle: getOptionSourceHandleId(nodeId, item.key)
              });
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
          {t('common:option') + ' ' + (index + 1)}
        </Box>
      </HStack>
      <Box position={'relative'} mt={1}>
        <Input
          value={item.value}
          bg={'white'}
          fontSize={'sm'}
          onChange={(e) => updateOptionValue(e.target.value)}
        />
        {!snapshot.isDragging && (
          <MySourceHandle
            nodeId={nodeId}
            handleId={getOptionSourceHandleId(nodeId, item.key)}
            position={Position.Right}
            translate={[34, 0]}
          />
        )}
      </Box>
    </Box>
  );
};
