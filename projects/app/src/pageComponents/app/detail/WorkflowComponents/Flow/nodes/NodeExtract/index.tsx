import React, { useMemo, useState } from 'react';
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
  Flex
} from '@chakra-ui/react';
import { type NodeProps } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { useTranslation } from 'next-i18next';
import NodeCard from '../render/NodeCard';
import Container from '../../components/Container';
import { AddIcon } from '@chakra-ui/icons';
import RenderInput from '../render/RenderInput';
import type { ContextExtractAgentItemType } from '@fastgpt/global/core/workflow/template/system/contextExtract/type';
import RenderOutput from '../render/RenderOutput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ExtractFieldModal, { defaultField } from './ExtractFieldModal';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import RenderToolInput from '../render/RenderToolInput';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io.d';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import IOTitle from '../../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import CatchError from '../render/RenderOutput/CatchError';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { WorkflowUtilsContext } from '../../../context/workflowUtilsContext';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';

const NodeExtract = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { inputs, outputs, nodeId, catchError } = data;

  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const { splitToolInputs, splitOutput } = useContextSelector(WorkflowUtilsContext, (ctx) => ctx);
  const { isTool, commonInputs } = useMemoEnhance(
    () => splitToolInputs(inputs, nodeId),
    [inputs, nodeId, splitToolInputs]
  );

  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitOutput(outputs),
    [splitOutput, outputs]
  );

  const [editExtractFiled, setEditExtractField] = useState<ContextExtractAgentItemType>();

  const CustomComponent = useMemo(
    () => ({
      [NodeInputKeyEnum.extractKeys]: ({
        value: extractKeys = [],
        ...props
      }: Omit<FlowNodeInputItemType, 'value'> & {
        value?: ContextExtractAgentItemType[];
      }) => (
        <Box mt={-2}>
          <Flex alignItems={'center'}>
            <Box flex={'1 0 0'} fontSize={'sm'} fontWeight={'medium'} color={'myGray.600'}>
              {t('common:core.module.extract.Target field')}
            </Box>
            <Button
              size={'sm'}
              variant={'grayGhost'}
              px={2}
              color={'myGray.600'}
              leftIcon={<AddIcon fontSize={'10px'} />}
              onClick={() => setEditExtractField(defaultField)}
            >
              {t('common:core.module.extract.Add field')}
            </Button>
          </Flex>

          <TableContainer borderRadius={'md'} overflow={'auto'} borderWidth={'1px'} mt={2}>
            <Table variant={'workflow'}>
              <Thead>
                <Tr>
                  <Th>{t('common:item_name')}</Th>
                  <Th>{t('common:item_description')}</Th>
                  <Th>{t('common:required')}</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {extractKeys.map((item, index) => (
                  <Tr key={index}>
                    <Td>
                      <Flex alignItems={'center'} maxW={'300px'} className={'textEllipsis'}>
                        <MyIcon name={'checkCircle'} w={'14px'} mr={1} color={'myGray.600'} />
                        {item.key}
                      </Flex>
                    </Td>
                    <Td>
                      <Box maxW={'300px'} whiteSpace={'pre-wrap'}>
                        {item.desc}
                      </Box>
                    </Td>
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
                        <MyIconButton
                          icon={'common/settingLight'}
                          onClick={() => {
                            setEditExtractField(item);
                          }}
                        />
                        <MyIconButton
                          icon={'delete'}
                          hoverColor={'red.500'}
                          onClick={() => {
                            onChangeNode({
                              nodeId,
                              type: 'updateInput',
                              key: NodeInputKeyEnum.extractKeys,
                              value: {
                                ...props,
                                value: extractKeys.filter((extract) => item.key !== extract.key)
                              }
                            });

                            onChangeNode({
                              nodeId,
                              type: 'delOutput',
                              key: item.key
                            });
                          }}
                        />
                      </Flex>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </Box>
      )
    }),
    [nodeId, onChangeNode, t]
  );

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      {isTool && (
        <>
          <Container>
            <RenderToolInput nodeId={nodeId} inputs={inputs} />
          </Container>
        </>
      )}
      <Container>
        <IOTitle text={t('common:Input')} />
        <RenderInput
          nodeId={nodeId}
          flowInputList={commonInputs}
          CustomComponent={CustomComponent}
        />
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
        <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
      </Container>
      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}

      {!!editExtractFiled && (
        <ExtractFieldModal
          defaultField={editExtractFiled}
          onClose={() => setEditExtractField(undefined)}
          onSubmit={(data) => {
            const input = inputs.find(
              (input) => input.key === NodeInputKeyEnum.extractKeys
            ) as FlowNodeInputItemType;
            const extracts: ContextExtractAgentItemType[] = input.value || [];

            const exists = extracts.find((item) => item.key === editExtractFiled.key);

            const newInputs = exists
              ? extracts.map((item) => (item.key === editExtractFiled.key ? data : item))
              : extracts.concat(data);

            onChangeNode({
              nodeId,
              type: 'updateInput',
              key: NodeInputKeyEnum.extractKeys,
              value: {
                ...input,
                value: newInputs
              }
            });

            const newOutput: FlowNodeOutputItemType = {
              id: getNanoid(),
              key: data.key,
              label: `${t('common:extraction_results')}-${data.key}`,
              valueType: data.valueType || WorkflowIOValueTypeEnum.string,
              type: FlowNodeOutputTypeEnum.static
            };

            if (exists) {
              if (editExtractFiled.key === data.key) {
                const output = outputs.find(
                  (output) => output.key === data.key
                ) as FlowNodeOutputItemType;

                // update
                onChangeNode({
                  nodeId,
                  type: 'updateOutput',
                  key: data.key,
                  value: {
                    ...output,
                    valueType: newOutput.valueType,
                    label: newOutput.label
                  }
                });
              } else {
                onChangeNode({
                  nodeId,
                  type: 'replaceOutput',
                  key: editExtractFiled.key,
                  value: newOutput
                });
              }
            } else {
              onChangeNode({
                nodeId,
                type: 'addOutput',
                value: newOutput
              });
            }

            setEditExtractField(undefined);
          }}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodeExtract);
