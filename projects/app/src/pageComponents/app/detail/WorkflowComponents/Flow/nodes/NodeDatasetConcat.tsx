import React, { useCallback, useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getOneQuoteInputTemplate } from '@fastgpt/global/core/workflow/template/system/datasetConcat';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import MySlider from '@/components/Slider';
import {
  type FlowNodeInputItemType,
  type ReferenceItemValueType
} from '@fastgpt/global/core/workflow/type/io.d';
import RenderOutput from './render/RenderOutput';
import IOTitle from '../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { ReferSelector, useReference } from './render/RenderInput/templates/Reference';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import ValueTypeLabel from './render/ValueTypeLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getWebLLMModel } from '@/web/common/system/utils';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';

const NodeDatasetConcat = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const { nodeList, onChangeNode } = useContextSelector(WorkflowContext, (v) => v);

  const CustomComponent = useMemo(() => {
    const quoteList = inputs.filter((item) => item.canEdit);
    const maxTokens = (() => {
      let maxTokens = 0;

      nodeList.forEach((item) => {
        if ([FlowNodeTypeEnum.chatNode, FlowNodeTypeEnum.tools].includes(item.flowNodeType)) {
          const model =
            item.inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value || '';
          const quoteMaxToken = getWebLLMModel(model)?.quoteMaxToken || 0;

          maxTokens = Math.max(maxTokens, quoteMaxToken);
        }
      });

      return maxTokens ? maxTokens : undefined;
    })();

    const maxTokenStep = (() => {
      if (!maxTokens || maxTokens < 8000) return 80;
      return Math.ceil(maxTokens / 80 / 100) * 100;
    })();

    return {
      [NodeInputKeyEnum.datasetMaxTokens]: (item: FlowNodeInputItemType) =>
        maxTokens ? (
          <Box px={2} bg={'white'} py={2} border={'base'} borderRadius={'md'}>
            <InputSlider
              min={100}
              max={maxTokens}
              step={maxTokenStep}
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
        ) : (
          <MyNumberInput
            size={'sm'}
            min={100}
            max={1000000}
            step={100}
            value={item.value}
            name={NodeInputKeyEnum.datasetMaxTokens}
            inputFieldProps={{ bg: 'white' }}
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
                {t('common:add_new')}
              </Button>
            </HStack>
            <Box mt={2}>
              {quoteList.map((children) => (
                <Box key={children.key} _notLast={{ mb: 3 }}>
                  <VariableSelector nodeId={nodeId} inputChildren={children} />
                </Box>
              ))}
            </Box>
          </>
        );
      }
    };
  }, [inputs, nodeId, nodeList, onChangeNode, t]);

  const Render = useMemo(() => {
    return (
      <NodeCard minW={'400px'} selected={selected} {...data}>
        <Container position={'relative'}>
          <RenderInput nodeId={nodeId} flowInputList={inputs} CustomComponent={CustomComponent} />
          {/* {RenderQuoteList} */}
        </Container>
        <Container>
          <IOTitle text={t('common:Output')} />
          <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
        </Container>
      </NodeCard>
    );
  }, [CustomComponent, data, inputs, nodeId, outputs, selected, t]);

  return Render;
};
export default React.memo(NodeDatasetConcat);

const VariableSelector = ({
  nodeId,
  inputChildren
}: {
  nodeId: string;
  inputChildren: FlowNodeInputItemType;
}) => {
  const { t } = useTranslation();
  const { onChangeNode } = useContextSelector(WorkflowContext, (v) => v);

  const { referenceList } = useReference({
    nodeId,
    valueType: inputChildren.valueType
  });

  const onSelect = useCallback(
    (e?: ReferenceItemValueType) => {
      if (!e) return;

      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: inputChildren.key,
        value: {
          ...inputChildren,
          value: e
        }
      });
    },
    [inputChildren, nodeId, onChangeNode]
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
        <FormLabel required={inputChildren.required}>{t(inputChildren.label as any)}</FormLabel>
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
        value={inputChildren.value}
        onSelect={onSelect}
        isArray={false}
      />
    </>
  );
};
