import React, { useMemo, useState } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  HStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import { defaultEditFormData } from './EditFieldModal';
import { useContextSelector } from 'use-context-selector';
import IOTitle from '../../../components/IOTitle';
import { SmallAddIcon } from '@chakra-ui/icons';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { WorkflowUtilsContext } from '../../../../context/workflowUtilsContext';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';
const EditFieldModal = dynamic(() => import('./EditFieldModal'));

export const hasDynamicToolInput = (inputs: FlowNodeInputItemType[]) =>
  inputs.some((item) => item.renderTypeList[0] === FlowNodeInputTypeEnum.addInputParam);

const RenderToolInput = ({
  nodeId,
  inputs
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
}) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const splitToolInputs = useContextSelector(WorkflowUtilsContext, (ctx) => ctx.splitToolInputs);
  const { toolInputs } = useMemoEnhance(
    () => splitToolInputs(inputs, nodeId),
    [inputs, nodeId, splitToolInputs]
  );

  const dynamicInput = useMemo(() => hasDynamicToolInput(inputs), [inputs]);

  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  if (!dynamicInput) return null;

  return (
    <>
      <HStack mb={2} justifyContent={'space-between'}>
        <IOTitle text={t('common:Input')} mb={0} />
        <Button
          variant={'whiteBase'}
          leftIcon={<SmallAddIcon />}
          iconSpacing={1}
          size={'sm'}
          onClick={() => setEditField(defaultEditFormData)}
        >
          {t('common:add_new')}
        </Button>
      </HStack>

      <Box borderRadius={'md'} overflow={'hidden'} border={'base'}>
        <TableContainer>
          <Table bg={'white'}>
            <Thead>
              <Tr>
                <Th>{t('common:item_name')}</Th>
                <Th>{t('common:item_description')}</Th>
                <Th>{t('common:required')}</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {toolInputs.map((item, index) => (
                <Tr
                  key={index}
                  position={'relative'}
                  whiteSpace={'pre-wrap'}
                  wordBreak={'break-all'}
                >
                  <Td>{item.key}</Td>
                  <Td>{item.toolDescription}</Td>
                  <Td>{item.required ? '✔' : ''}</Td>
                  <Td whiteSpace={'nowrap'}>
                    <MyIcon
                      mr={3}
                      name={'common/settingLight'}
                      w={'16px'}
                      cursor={'pointer'}
                      onClick={() => setEditField(item)}
                    />
                    <MyIcon
                      name={'delete'}
                      w={'16px'}
                      cursor={'pointer'}
                      onClick={() => {
                        onChangeNode({
                          nodeId,
                          type: 'delInput',
                          key: item.key
                        });
                      }}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </Box>

      {!!editField && (
        <EditFieldModal
          defaultValue={editField}
          nodeId={nodeId}
          onClose={() => setEditField(undefined)}
        />
      )}
    </>
  );
};

export default React.memo(RenderToolInput);
