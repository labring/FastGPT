import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useMemo, useState } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import Container from '../../components/Container';
import RenderInput from '../render/RenderInput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import {
  Box,
  Button,
  Flex,
  FormLabel,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import { UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'react-i18next';
import {
  FlowNodeInputMap,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { SmallAddIcon } from '@chakra-ui/icons';
import IOTitle from '../../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import InputFormEditModal, { defaultFormInput } from './InputFormEditModal';
import RenderOutput from '../render/RenderOutput';

const NodeFormInput = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, inputs, outputs } = data;
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const [editField, setEditField] = useState<UserInputFormItemType>();

  const CustomComponent = useMemo(
    () => ({
      [NodeInputKeyEnum.userInputForms]: ({ value, key, ...props }: FlowNodeInputItemType) => {
        const inputs = value as UserInputFormItemType[];

        const onSubmit = (data: UserInputFormItemType) => {
          if (!editField?.label) {
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
                id: data.label,
                valueType: data.valueType,
                key: data.label,
                label: data.label,
                type: FlowNodeOutputTypeEnum.static
              }
            });
          } else {
            const output = outputs.find((output) => output.key === editField.label);

            onChangeNode({
              nodeId,
              type: 'updateInput',
              key,
              value: {
                ...props,
                key,
                value: inputs.map((input) => (input.label === editField.label ? data : input))
              }
            });
            onChangeNode({
              nodeId,
              type: 'replaceOutput',
              key: editField.label,
              value: {
                ...(output as FlowNodeOutputItemType),
                valueType: data.valueType,
                key: data.label,
                label: data.label
              }
            });
          }
        };

        const onDelete = (label: string) => {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key,
            value: {
              ...props,
              key,
              value: inputs.filter((input) => input.label !== label)
            }
          });
          onChangeNode({
            nodeId,
            type: 'delOutput',
            key: label
          });
        };

        return (
          <Box>
            <HStack className="nodrag" cursor={'default'} mb={3}>
              <FormLabel>{t('common:core.module.input_form')}</FormLabel>
              <Box flex={'1 0 0'} />
              <Button
                variant={'ghost'}
                leftIcon={<SmallAddIcon />}
                iconSpacing={1}
                size={'sm'}
                onClick={() => {
                  setEditField(defaultFormInput);
                }}
              >
                {t('common:common.Add_new_input')}
              </Button>
              {!!editField && (
                <InputFormEditModal
                  defaultValue={editField}
                  onClose={() => {
                    setEditField(undefined);
                  }}
                  onSubmit={onSubmit}
                />
              )}
            </HStack>

            <TableContainer>
              <Table bg={'white'}>
                <Thead>
                  <Tr>
                    <Th borderBottomLeftRadius={'none !important'}>
                      {t('common:core.module.input_name')}
                    </Th>
                    <Th>{t('common:core.module.input_description')}</Th>
                    <Th>{t('common:common.Require Input')}</Th>
                    <Th borderBottomRightRadius={'none !important'}>{t('user:operations')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {inputs.map((item, index) => {
                    const icon = FlowNodeInputMap[item.type as FlowNodeInputTypeEnum]?.icon;
                    return (
                      <Tr key={index}>
                        <Td>
                          <Flex alignItems={'center'}>
                            {!!icon && (
                              <MyIcon name={icon as any} w={'14px'} mr={1} color={'primary.600'} />
                            )}
                            {item.label}
                          </Flex>
                        </Td>
                        <Td>{item.description}</Td>
                        <Td>{item.required ? '✅' : ''}</Td>
                        <Td>
                          <MyIcon
                            mr={3}
                            name={'common/settingLight'}
                            w={'16px'}
                            cursor={'pointer'}
                            _hover={{ color: 'primary.600' }}
                            onClick={() => setEditField(item)}
                          />
                          <MyIcon
                            className="delete"
                            name={'delete'}
                            w={'16px'}
                            color={'myGray.600'}
                            cursor={'pointer'}
                            ml={2}
                            _hover={{ color: 'red.500' }}
                            onClick={() => {
                              onDelete(item.label);
                            }}
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        );
      }
    }),
    [nodeId, editField, t, setEditField, onChangeNode]
  );

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container>
        <IOTitle text={t('common:common.Input')} />
        <RenderInput nodeId={nodeId} flowInputList={inputs} CustomComponent={CustomComponent} />
      </Container>
      <Container>
        <IOTitle text={t('common:common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeFormInput);
