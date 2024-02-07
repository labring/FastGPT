import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { AddIcon } from '@chakra-ui/icons';
import {
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum
} from '@fastgpt/global/core/module/constants';
import { getOneQuoteInputTemplate } from '@fastgpt/global/core/module/template/system/datasetConcat';
import { onChangeNode, useFlowProviderStore } from '../../FlowProvider';
import TargetHandle from '../render/TargetHandle';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SourceHandle from '../render/SourceHandle';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MySlider from '@/components/Slider';

const NodeDatasetConcat = ({ data, selected }: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();
  const { nodes } = useFlowProviderStore();
  const { moduleId, inputs, outputs } = data;

  const quotes = inputs.filter((item) => item.valueType === ModuleIOValueTypeEnum.datasetQuote);

  const tokenLimit = useMemo(() => {
    let maxTokens = 3000;

    nodes.forEach((item) => {
      if (item.type === FlowNodeTypeEnum.chatNode) {
        const model =
          item.data.inputs.find((item) => item.key === ModuleInputKeyEnum.aiModel)?.value || '';
        const quoteMaxToken =
          llmModelList.find((item) => item.model === model)?.quoteMaxToken || 3000;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    return maxTokens;
  }, [llmModelList, nodes]);

  const RenderQuoteList = useMemo(
    () => (
      <Box>
        <Box>
          {quotes.map((quote, i) => (
            <Flex key={quote.key} position={'relative'} mb={4} alignItems={'center'}>
              <TargetHandle handleKey={quote.key} valueType={quote.valueType} />
              <Box>
                {t('core.chat.Quote')}
                {i + 1}
              </Box>
              <MyIcon
                ml={2}
                w={'14px'}
                name={'delete'}
                cursor={'pointer'}
                _hover={{ color: 'red.600' }}
                onClick={() => {
                  onChangeNode({
                    moduleId,
                    type: 'delInput',
                    key: quote.key
                  });
                }}
              />
            </Flex>
          ))}
        </Box>
        <Button
          leftIcon={<AddIcon />}
          variant={'whiteBase'}
          onClick={() => {
            onChangeNode({
              moduleId,
              type: 'addInput',
              value: getOneQuoteInputTemplate()
            });
          }}
        >
          {t('core.module.Dataset quote.Add quote')}
        </Button>
      </Box>
    ),
    [moduleId, quotes, t]
  );

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container borderTop={'2px solid'} borderTopColor={'myGray.200'} position={'relative'}>
        <RenderInput
          moduleId={moduleId}
          flowInputList={inputs}
          CustomComponent={{
            [ModuleInputKeyEnum.datasetMaxTokens]: (item) => (
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
                      moduleId,
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
            )
          }}
        />
        {/* render dataset select */}
        {RenderQuoteList}
        <Flex position={'absolute'} right={4} top={'60%'}>
          <Box>{t('core.module.Dataset quote.Concat result')}</Box>
          <SourceHandle
            handleKey={ModuleOutputKeyEnum.datasetQuoteQA}
            valueType={ModuleIOValueTypeEnum.datasetQuote}
            // transform={'translate(-14px, -50%)'}
          />
        </Flex>
        {/* <RenderOutput moduleId={moduleId} flowOutputList={outputs} /> */}
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeDatasetConcat);
