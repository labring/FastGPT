/* Abandon */
import React, { useCallback, useMemo, useState } from 'react';
import { NodeProps } from 'reactflow';
import { Box, Button, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/core/app/flow';
import Container from '../modules/Container';
import { SystemInputEnum, VariableInputEnum } from '@/constants/app';
import type { VariableItemType } from '@/types/app';
import MyIcon from '@/components/Icon';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import VariableEditModal, { addVariable } from '../../../VariableEditModal';
import { useFlowStore } from '../Provider';

export const defaultVariable: VariableItemType = {
  id: nanoid(),
  key: 'key',
  label: 'label',
  type: VariableInputEnum.input,
  required: true,
  maxLen: 50,
  enums: [{ value: '' }]
};

const NodeUserGuide = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { inputs, moduleId } = data;
  const { onChangeNode } = useFlowStore();

  const variables = useMemo(
    () =>
      (inputs.find((item) => item.key === SystemInputEnum.variables)
        ?.value as VariableItemType[]) || [],
    [inputs]
  );

  const [editVariable, setEditVariable] = useState<VariableItemType>();

  const updateVariables = useCallback(
    (value: VariableItemType[]) => {
      onChangeNode({
        moduleId,
        key: SystemInputEnum.variables,
        type: 'inputs',
        value: {
          ...inputs.find((item) => item.key === SystemInputEnum.variables),
          value
        }
      });
    },
    [inputs, onChangeNode, moduleId]
  );

  const onclickSubmit = useCallback(
    ({ variable }: { variable: VariableItemType }) => {
      updateVariables(variables.map((item) => (item.id === variable.id ? variable : item)));
      setEditVariable(undefined);
    },
    [updateVariables, variables]
  );

  return (
    <>
      <NodeCard minW={'300px'} {...data}>
        <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>变量名</Th>
                  <Th>变量 key</Th>
                  <Th>必填</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {variables.map((item, index) => (
                  <Tr key={index}>
                    <Td>{item.label} </Td>
                    <Td>{item.key}</Td>
                    <Td>{item.required ? '✔' : ''}</Td>
                    <Td>
                      <MyIcon
                        mr={3}
                        name={'settingLight'}
                        w={'16px'}
                        cursor={'pointer'}
                        onClick={() => {
                          setEditVariable(item);
                        }}
                      />
                      <MyIcon
                        name={'delete'}
                        w={'16px'}
                        cursor={'pointer'}
                        onClick={() =>
                          updateVariables(variables.filter((variable) => variable.id !== item.id))
                        }
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
          <Box mt={2} textAlign={'right'}>
            <Button
              variant={'base'}
              leftIcon={<AddIcon fontSize={'10px'} />}
              onClick={() => {
                const newVariable = addVariable();
                updateVariables(variables.concat(newVariable));
                setEditVariable(newVariable);
              }}
            >
              新增
            </Button>
          </Box>
        </Container>
      </NodeCard>
      {!!editVariable && (
        <VariableEditModal
          defaultVariable={editVariable}
          onClose={() => setEditVariable(undefined)}
          onSubmit={onclickSubmit}
        />
      )}
    </>
  );
};
export default React.memo(NodeUserGuide);
