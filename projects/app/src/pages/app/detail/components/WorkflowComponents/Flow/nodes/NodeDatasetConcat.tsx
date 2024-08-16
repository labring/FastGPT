import React, { useCallback, useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import { NodeInputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { getOneQuoteInputTemplate } from '@fastgpt/global/core/workflow/template/system/datasetConcat';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MySlider from '@/components/Slider';
import {
  FlowNodeInputItemType,
  ReferenceValueProps
} from '@fastgpt/global/core/workflow/type/io.d';
import RenderOutput from './render/RenderOutput';
import IOTitle from '../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { ReferSelector, useReference } from './render/RenderInput/templates/Reference';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import ValueTypeLabel from './render/ValueTypeLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { isWorkflowStartOutput } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { getWebLLMModel } from '@/web/common/system/utils';

const NodeDatasetConcat = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();
  const { nodeId, inputs, outputs } = data;
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const quoteList = useMemo(() => inputs.filter((item) => item.canEdit), [inputs]);

  const tokenLimit = useMemo(() => {
    let maxTokens = 3000;

    nodeList.forEach((item) => {
      if (item.flowNodeType === FlowNodeTypeEnum.chatNode) {
        const model =
          item.inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value || '';
        const quoteMaxToken = getWebLLMModel(model)?.quoteMaxToken || 3000;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    return maxTokens;
  }, [llmModelList, nodeList]);

  const CustomComponent = useMemo(() => {
    return {
      [NodeInputKeyEnum.datasetMaxTokens]: (item: FlowNodeInputItemType) => (
        <Box px={2}>
          <MySlider
            markList={[
              { label: '100', value: 100 },
              { label: tokenLimit, value: tokenLimit }
            ]}
            width={'100%'}
            min={100}
            max={tokenLimit}
            step={50}
            value={item.value}
            onChange={(e) => {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: item.key,
                value: {
                  ...item,
                  value: e
                }
              });
            }}
          />
        </Box>
      ),
      [NodeInputKeyEnum.datasetQuoteList]: (item: FlowNodeInputItemType) => {
        return (
          <>
            <HStack className="nodrag" cursor={'default'} position={'relative'}>
              <HStack spacing={1} position={'relative'} fontWeight={'medium'} color={'myGray.600'}>
                <Box>{t('common:core.workflow.Dataset quote')}</Box>
              </HStack>
              <Box flex={'1 0 0'} />
              <Button
                variant={'whiteBase'}
                leftIcon={<SmallAddIcon />}
                iconSpacing={1}
                size={'sm'}
                onClick={() => {
                  onChangeNode({
                    nodeId,
                    type: 'addInput',
                    value: getOneQuoteInputTemplate({ index: quoteList.length + 1 })
                  });
                }}
              >
                {t('common:common.Add New')}
              </Button>
            </HStack>
            <Box mt={2}>
              {quoteList.map((children) => (
                <Box key={children.key} _notLast={{ mb: 3 }}>
                  <Reference nodeId={nodeId} inputChildren={children} />
                </Box>
              ))}
            </Box>
          </>
        );
      }
    };
  }, [nodeId, onChangeNode, quoteList, t, tokenLimit]);

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container position={'relative'}>
        <RenderInput nodeId={nodeId} flowInputList={inputs} CustomComponent={CustomComponent} />
        {/* {RenderQuoteList} */}
      </Container>
      <Container>
        <IOTitle text={t('common:common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeDatasetConcat);

function Reference({
  nodeId,
  inputChildren
}: {
  nodeId: string;
  inputChildren: FlowNodeInputItemType;
}) {
  const { t } = useTranslation();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const { referenceList, formatValue } = useReference({
    nodeId,
    valueType: inputChildren.valueType,
    value: inputChildren.value
  });

  const onSelect = useCallback(
    (e: ReferenceValueProps) => {
      const workflowStartNode = nodeList.find(
        (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
      );

      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: inputChildren.key,
        value: {
          ...inputChildren,
          value:
            e[0] === workflowStartNode?.id && !isWorkflowStartOutput(e[1])
              ? [VARIABLE_NODE_ID, e[1]]
              : e
        }
      });
    },
    [inputChildren, nodeId, nodeList, onChangeNode]
  );

  const onDel = useCallback(() => {
    onChangeNode({
      nodeId,
      type: 'delInput',
      key: inputChildren.key
    });
  }, [inputChildren.key, nodeId, onChangeNode]);

  return (
    <>
      <Flex alignItems={'center'} mb={1}>
        <FormLabel required={inputChildren.required}>{inputChildren.label}</FormLabel>
        {/* value */}
        <ValueTypeLabel valueType={inputChildren.valueType} valueDesc={inputChildren.valueDesc} />

        <MyIcon
          className="delete"
          name={'delete'}
          w={'14px'}
          color={'myGray.500'}
          cursor={'pointer'}
          ml={2}
          _hover={{ color: 'red.600' }}
          onClick={onDel}
        />
      </Flex>
      <ReferSelector
        placeholder={t(
          (inputChildren.referencePlaceholder as any) ||
            t('common:core.module.Dataset quote.select')
        )}
        list={referenceList}
        value={formatValue}
        onSelect={onSelect}
      />
    </>
  );
}
