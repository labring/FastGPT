/* Abandon */
import React, { useCallback, useMemo, useState } from 'react';
import { NodeProps } from 'reactflow';
import { Box, Button, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import NodeCard from '../../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Container from '../../modules/Container';
import { VariableInputEnum, ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { VariableItemType } from '@fastgpt/global/core/module/type.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import VariableEditModal, { addVariable } from '../../modules/VariableEdit';
import { onChangeNode } from '../../../FlowProvider';

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

  const variables = useMemo(
    () =>
      (inputs.find((item) => item.key === ModuleInputKeyEnum.variables)
        ?.value as VariableItemType[]) || [],
    [inputs]
  );

  return (
    <>
      <NodeCard minW={'300px'} {...data}>
        <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
          <VariableEditModal
            variables={variables}
            onChange={(e) =>
              onChangeNode({
                moduleId,
                key: ModuleInputKeyEnum.variables,
                type: 'updateInput',
                value: {
                  ...inputs.find((item) => item.key === ModuleInputKeyEnum.variables),
                  value: e
                }
              })
            }
          />
        </Container>
      </NodeCard>
    </>
  );
};
export default React.memo(NodeUserGuide);
