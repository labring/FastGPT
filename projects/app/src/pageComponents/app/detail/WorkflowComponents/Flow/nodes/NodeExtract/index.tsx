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
import { NodeProps } from 'reactflow';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
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
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io.d';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import IOTitle from '../../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

const NodeExtract = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { inputs, outputs, nodeId } = data;

  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const splitToolInputs = useContextSelector(WorkflowContext, (ctx) => ctx.splitToolInputs);
  const { isTool, commonInputs } = splitToolInputs(inputs, nodeId);
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

          <TableContainer borderRadius={'md'} overflow={'hidden'} borderWidth={'1px'} mt={2}>
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
                      <Flex alignItems={'center'}>
                        <MyIcon name={'checkCircle'} w={'14px'} mr={1} color={'myGray.600'} />
                        {item.key}
                      </Flex>
                    </Td>
                    <Td>{item.desc}</Td>
                    <Td>
                      {item.required ? (
                        <Flex alignItems={'center'}>
                          <MyIcon name={'check'} w={'16px'} color={'myGray.900'} mr={2} />
                        </Flex>
                      ) : (
                        ''
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
      <>
        <Container>
          <IOTitle text={t('common:common.Input')} />
          <RenderInput
            nodeId={nodeId}
            flowInputList={commonInputs}
            CustomComponent={CustomComponent}
          />
        </Container>
      </>
      <>
        <Container>
          <IOTitle text={t('common:common.Output')} />
          <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
        </Container>
      </>

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
              label: `${t('common:extraction_results')}-${data.desc}`,
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
