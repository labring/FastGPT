import React, { useCallback, useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import { WorkflowIOValueTypeEnum, NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getOneQuoteInputTemplate } from '@fastgpt/global/core/workflow/template/system/datasetConcat';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MySlider from '@/components/Slider';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import RenderOutput from './render/RenderOutput';
import IOTitle from '../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const NodeDatasetConcat = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();
  const { nodeId, inputs, outputs } = data;
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const quotes = useMemo(
    () => inputs.filter((item) => item.valueType === WorkflowIOValueTypeEnum.datasetQuote),
    [inputs]
  );

  const tokenLimit = useMemo(() => {
    let maxTokens = 3000;

    nodeList.forEach((item) => {
      if (item.flowNodeType === FlowNodeTypeEnum.chatNode) {
        const model =
          item.inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value || '';
        const quoteMaxToken =
          llmModelList.find((item) => item.model === model)?.quoteMaxToken || 3000;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    return maxTokens;
  }, [llmModelList, nodeList]);

  const onAddField = useCallback(() => {
    onChangeNode({
      nodeId,
      type: 'addInput',
      value: getOneQuoteInputTemplate({ index: quotes.length + 1 })
    });
  }, [nodeId, onChangeNode, quotes.length]);

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
      customComponent: (item: FlowNodeInputItemType) => (
        <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
          <Box position={'relative'} fontWeight={'medium'} color={'myGray.600'}>
            {t('core.workflow.Dataset quote')}
          </Box>
          <Box flex={'1 0 0'} />
          <Button
            variant={'whitePrimary'}
            leftIcon={<SmallAddIcon />}
            iconSpacing={1}
            size={'sm'}
            mr={'-5px'}
            onClick={onAddField}
          >
            {t('common.Add New')}
          </Button>
        </Flex>
      )
    };
  }, [nodeId, onAddField, onChangeNode, t, tokenLimit]);

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container position={'relative'}>
        <RenderInput nodeId={nodeId} flowInputList={inputs} CustomComponent={CustomComponent} />
        {/* {RenderQuoteList} */}
      </Container>
      <Container>
        <IOTitle text={t('common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeDatasetConcat);
