import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import React, { useMemo, useState } from 'react';
import { Box, Button, Table, Thead, Tbody, Tr, Th, Td, Flex } from '@chakra-ui/react';
import { type NodeProps } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
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
import RenderToolInput, { hasDynamicToolInput } from '../render/RenderToolInput';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import IOTitle from '../../components/IOTitle';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import CatchError from '../render/RenderOutput/CatchError';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import {
  getOutputDisconnectCommands,
  splitNodeOutputs,
  splitToolInputsByMode
} from '@/web/core/workflow/utils';
import { useIsToolNode } from '../render/useWorkflowDocument';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';

const NodeExtract = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { inputs, outputs, nodeId, catchError } = data;

  const { t } = useTranslation();
  const node = useNode(nodeId);
  // 边集合只在删除/改名字段的回调里读，走非订阅 getter：点击时取当前值，组件不订阅结构变更。
  const { getEdges } = useWorkflowActions();

  const isTool = useIsToolNode(nodeId);
  const { commonInputs } = useMemoEnhance(
    () => splitToolInputsByMode(inputs, isTool),
    [inputs, isTool]
  );

  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitNodeOutputs(outputs),
    [outputs]
  );

  const [editExtractFiled, setEditExtractField] = useState<ContextExtractAgentItemType>();

  const CustomComponent = useMemo(
    () => ({
      [NodeInputKeyEnum.extractKeys]: ({
        value: extractKeys = []
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

          <FixedTableContainer
            bodyBg="white"
            flush
            className="nodrag nowheel"
            borderRadius={'md'}
            borderWidth={'1px'}
            mt={2}
          >
            <Table variant={'workflow'}>
              <Thead>
                <Tr>
                  <Th pl={'24px !important'} pr={'8px !important'}>
                    {t('common:item_name')}
                  </Th>
                  <Th px={'8px !important'}>{t('common:item_description')}</Th>
                  <Th px={'8px !important'}>{t('common:required')}</Th>
                  <Th w={'80px'} pl={'8px !important'} pr={'24px !important'}></Th>
                </Tr>
              </Thead>
              <Tbody>
                {extractKeys.map((item, index) => (
                  <Tr key={index}>
                    <Td pl={'24px !important'} pr={'8px !important'}>
                      <Flex alignItems={'center'} maxW={'300px'} className={'textEllipsis'}>
                        <MyIcon name={'checkCircle'} w={'14px'} mr={1} color={'myGray.600'} />
                        {item.key}
                      </Flex>
                    </Td>
                    <Td px={'8px !important'}>
                      <Box maxW={'300px'} whiteSpace={'pre-wrap'}>
                        {item.desc}
                      </Box>
                    </Td>
                    <Td px={'8px !important'}>
                      {item.required ? (
                        <Flex alignItems={'center'}>
                          <MyIcon name={'check'} w={'16px'} color={'myGray.900'} mr={2} />
                        </Flex>
                      ) : (
                        '-'
                      )}
                    </Td>
                    <Td w={'80px'} pl={'8px !important'} pr={'24px !important'}>
                      <Flex w={'max-content'}>
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
                            // 抽取字段与其结果 output 一起删除，旧 handle 连线同事务断开。
                            node?.updateNode(
                              (current) => ({
                                inputs: current.inputs.map((input) =>
                                  input.key === NodeInputKeyEnum.extractKeys
                                    ? {
                                        ...input,
                                        value: extractKeys.filter(
                                          (extract) => extract.key !== item.key
                                        )
                                      }
                                    : input
                                ),
                                outputs: current.outputs.filter((output) => output.key !== item.key)
                              }),
                              {
                                disconnectEdges: getOutputDisconnectCommands({
                                  edges: getEdges(),
                                  nodeId,
                                  outputKey: item.key
                                })
                              }
                            );
                          }}
                        />
                      </Flex>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </FixedTableContainer>
        </Box>
      )
    }),
    [getEdges, node, nodeId, t]
  );

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      {isTool && hasDynamicToolInput(data) && (
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
          isTool={isTool}
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
            const documentInputs = node?.data.inputs;
            if (!documentInputs) return;

            const input = documentInputs.find(
              (item) => item.key === NodeInputKeyEnum.extractKeys
            ) as FlowNodeInputItemType;
            const extracts: ContextExtractAgentItemType[] = input?.value || [];
            const exists = extracts.find((item) => item.key === editExtractFiled.key);

            const newOutput: FlowNodeOutputItemType = {
              id: getNanoid(),
              key: data.key,
              label: `${t('common:extraction_results')}-${data.key}`,
              valueType: data.valueType || WorkflowIOValueTypeEnum.string,
              type: FlowNodeOutputTypeEnum.static
            };

            // 改名等于替换输出字段，旧 handle 上的连线必须同事务断开；未改名则原地更新，不动连线。
            const replacedKey =
              exists && editExtractFiled.key !== data.key ? editExtractFiled.key : undefined;

            node?.updateNode(
              (current) => ({
                inputs: current.inputs.map((item) =>
                  item.key === NodeInputKeyEnum.extractKeys
                    ? {
                        ...item,
                        value: exists
                          ? extracts.map((extract) =>
                              extract.key === editExtractFiled.key ? data : extract
                            )
                          : extracts.concat(data)
                      }
                    : item
                ),
                outputs: replacedKey
                  ? current.outputs.map((output) =>
                      output.key === replacedKey ? newOutput : output
                    )
                  : exists
                    ? current.outputs.map((output) =>
                        output.key === data.key
                          ? { ...output, valueType: newOutput.valueType, label: newOutput.label }
                          : output
                      )
                    : current.outputs.concat(newOutput)
              }),
              replacedKey
                ? {
                    disconnectEdges: getOutputDisconnectCommands({
                      edges: getEdges(),
                      nodeId,
                      outputKey: replacedKey
                    })
                  }
                : undefined
            );

            setEditExtractField(undefined);
          }}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodeExtract);
