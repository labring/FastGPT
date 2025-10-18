import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useMemo, useState } from 'react';
import { type NodeProps, useViewport } from 'reactflow';
import NodeCard from '../render/NodeCard';
import Container from '../../components/Container';
import RenderInput from '../render/RenderInput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import {
  Box,
  Button,
  Flex,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { type UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import type { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  FlowNodeInputMap,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { SmallAddIcon } from '@chakra-ui/icons';
import IOTitle from '../../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import InputFormEditModal, { defaultFormInput } from './InputFormEditModal';
import RenderOutput from '../render/RenderOutput';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import DndDrag, {
  Draggable,
  type DraggableProvided,
  type DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';

const NodeFormInput = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, inputs, outputs } = data;
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { zoom } = useViewport();

  const [editField, setEditField] = useState<UserInputFormItemType>();

  const CustomComponent = useMemo(
    () => ({
      [NodeInputKeyEnum.userInputForms]: ({ value, key, ...props }: FlowNodeInputItemType) => {
        const inputs = value as UserInputFormItemType[];

        const onSubmit = (data: UserInputFormItemType) => {
          if (!editField?.key) {
            onChangeNode({
              nodeId,
              type: 'updateInput',
              key,
              value: {
                ...props,
                key,
                value: inputs.concat(data)
              }
            });
            onChangeNode({
              nodeId,
              type: 'addOutput',
              value: {
                id: data.key,
                valueType: data.valueType,
                key: data.key,
                label: data.label,
                type: FlowNodeOutputTypeEnum.static
              }
            });
          } else {
            const output = outputs.find((output) => output.key === editField.key);
            onChangeNode({
              nodeId,
              type: 'updateInput',
              key,
              value: {
                ...props,
                key,
                value: inputs.map((input) => (input.key === editField.key ? data : input))
              }
            });
            onChangeNode({
              nodeId,
              type: 'replaceOutput',
              key: editField.key,
              value: {
                ...(output as FlowNodeOutputItemType),
                valueType: data.valueType,
                key: data.key,
                label: data.label
              }
            });
          }
        };

        const onDelete = (valueKey: string) => {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key,
            value: {
              ...props,
              key,
              value: inputs.filter((input) => input.key !== valueKey)
            }
          });
          onChangeNode({
            nodeId,
            type: 'delOutput',
            key: valueKey
          });
        };

        return (
          <Box>
            <HStack className="nodrag" cursor={'default'} mb={3}>
              <FormLabel fontSize={'sm'} color={'myGray.600'}>
                {t('workflow:user_form_input_config')}
              </FormLabel>
              <Box flex={'1 0 0'} />
              <Button
                variant={'grayGhost'}
                px={2}
                color={'myGray.600'}
                leftIcon={<SmallAddIcon />}
                iconSpacing={1}
                size={'sm'}
                onClick={() => {
                  setEditField(defaultFormInput);
                }}
              >
                {t('common:Add_new_input')}
              </Button>
              {!!editField && (
                <InputFormEditModal
                  defaultValue={editField}
                  keys={inputs.map((item) => item.key)}
                  onClose={() => {
                    setEditField(undefined);
                  }}
                  onSubmit={onSubmit}
                />
              )}
            </HStack>
            <TableContainer borderWidth={'1px'} borderRadius={'md'}>
              <Table variant={'workflow'}>
                <Thead>
                  <Tr>
                    <Th>{t('workflow:user_form_input_name')}</Th>
                    <Th>{t('workflow:user_form_input_description')}</Th>
                    <Th>{t('common:Required_input')}</Th>
                    <Th>{t('user:operations')}</Th>
                  </Tr>
                </Thead>
                <DndDrag<UserInputFormItemType>
                  onDragEndCb={(list) => {
                    const sortedOutputs = [
                      outputs[0],
                      ...outputs.slice(1).sort((a, b) => {
                        const aIndex = list.findIndex((item) => item.key === a.key);
                        const bIndex = list.findIndex((item) => item.key === b.key);
                        return aIndex - bIndex;
                      })
                    ];

                    onChangeNode({
                      nodeId,
                      type: 'updateInput',
                      key,
                      value: {
                        ...props,
                        key,
                        value: list
                      }
                    });
                    onChangeNode({
                      nodeId,
                      type: 'attr',
                      key: 'outputs',
                      value: sortedOutputs
                    });
                  }}
                  dataList={inputs}
                  renderClone={(provided, snapshot, rubric) => {
                    const item = inputs[rubric.source.index];
                    const icon = FlowNodeInputMap[item.type as FlowNodeInputTypeEnum]?.icon;

                    return (
                      <TableItem
                        provided={provided}
                        snapshot={snapshot}
                        item={item}
                        icon={icon}
                        setEditField={setEditField}
                        onDelete={onDelete}
                      />
                    );
                  }}
                  zoom={zoom}
                >
                  {({ provided }) => (
                    <Tbody {...provided.droppableProps} ref={provided.innerRef}>
                      {inputs.map((item, index) => {
                        const icon = FlowNodeInputMap[item.type as FlowNodeInputTypeEnum]?.icon;
                        return (
                          <Draggable key={item.key} draggableId={item.key} index={index}>
                            {(provided, snapshot) => (
                              <TableItem
                                provided={provided}
                                snapshot={snapshot}
                                key={item.key}
                                item={item}
                                icon={icon}
                                setEditField={setEditField}
                                onDelete={onDelete}
                              />
                            )}
                          </Draggable>
                        );
                      })}
                    </Tbody>
                  )}
                </DndDrag>
              </Table>
            </TableContainer>
          </Box>
        );
      }
    }),
    [t, editField, zoom, onChangeNode, nodeId, outputs]
  );

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container>
        <IOTitle text={t('common:Input')} />
        <RenderInput nodeId={nodeId} flowInputList={inputs} CustomComponent={CustomComponent} />
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeFormInput);

const TableItem = ({
  provided,
  snapshot,
  item,
  icon,
  setEditField,
  onDelete
}: {
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  item: UserInputFormItemType;
  icon: string;
  setEditField: (item: UserInputFormItemType) => void;
  onDelete: (valueKey: string) => void;
}) => {
  return (
    <Tr
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
    >
      <Td>
        <Flex alignItems={'center'} fontSize={'mini'} fontWeight={'medium'} whiteSpace={'nowrap'}>
          {!!icon && <MyIcon name={icon as any} w={'14px'} mr={1} color={'myGray.400'} />}
          {item.label}
        </Flex>
      </Td>
      <Td>{item.description || '-'}</Td>
      <Td>
        {item.required ? (
          <Flex alignItems={'center'}>
            <MyIcon name={'check'} w={'16px'} color={'myGray.900'} mr={2} />
          </Flex>
        ) : (
          '-'
        )}
      </Td>
      <Td>
        <Flex>
          <MyIconButton icon={'common/settingLight'} onClick={() => setEditField(item)} />
          <MyIconButton icon={'delete'} hoverColor={'red.500'} onClick={() => onDelete(item.key)} />
        </Flex>
      </Td>
    </Tr>
  );
};
