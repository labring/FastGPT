import { storeNodes2RuntimeNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type';
import { RuntimeEdgeItemType, StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { useCallback, useState } from 'react';
import { checkWorkflowNodeAndConnection } from '@/web/core/workflow/utils';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { uiWorkflow2StoreWorkflow } from '../../utils';
import { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

import dynamic from 'next/dynamic';
import {
  Box,
  Button,
  Flex,
  Textarea,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Switch
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { checkInputIsReference } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext, getWorkflowStore } from '../../context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const MyRightDrawer = dynamic(
  () => import('@fastgpt/web/components/common/MyDrawer/MyRightDrawer')
);
const JsonEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/JsonEditor'));

export const useDebug = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const setNodes = useContextSelector(WorkflowContext, (v) => v.setNodes);
  const onUpdateNodeError = useContextSelector(WorkflowContext, (v) => v.onUpdateNodeError);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);
  const onStartNodeDebug = useContextSelector(WorkflowContext, (v) => v.onStartNodeDebug);

  const [runtimeNodeId, setRuntimeNodeId] = useState<string>();
  const [runtimeNodes, setRuntimeNodes] = useState<RuntimeNodeItemType[]>();
  const [runtimeEdges, setRuntimeEdges] = useState<RuntimeEdgeItemType[]>();

  const flowData2StoreDataAndCheck = useCallback(async () => {
    const { nodes } = await getWorkflowStore();

    const checkResults = checkWorkflowNodeAndConnection({ nodes, edges });
    if (!checkResults) {
      const storeNodes = uiWorkflow2StoreWorkflow({ nodes, edges });

      return JSON.stringify(storeNodes);
    } else {
      checkResults.forEach((nodeId) => onUpdateNodeError(nodeId, true));

      toast({
        status: 'warning',
        title: t('core.workflow.Check Failed')
      });
      return Promise.reject();
    }
  }, [edges, onUpdateNodeError, t, toast]);

  const openDebugNode = useCallback(
    async ({ entryNodeId }: { entryNodeId: string }) => {
      setNodes((state) =>
        state.map((node) => ({
          ...node,
          data: {
            ...node.data,
            debugResult: undefined
          }
        }))
      );
      const {
        nodes,
        edges
      }: {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      } = JSON.parse(await flowData2StoreDataAndCheck());

      const runtimeNodes = storeNodes2RuntimeNodes(nodes, [entryNodeId]);
      const runtimeEdges: RuntimeEdgeItemType[] = edges.map((edge) =>
        edge.target === entryNodeId
          ? {
              ...edge,
              status: 'active'
            }
          : {
              ...edge,
              status: 'waiting'
            }
      );

      setRuntimeNodeId(entryNodeId);
      setRuntimeNodes(runtimeNodes);
      setRuntimeEdges(runtimeEdges);
    },
    [flowData2StoreDataAndCheck, setNodes]
  );

  const DebugInputModal = useCallback(() => {
    if (!runtimeNodes || !runtimeEdges) return <></>;

    const runtimeNode = runtimeNodes.find((node) => node.nodeId === runtimeNodeId);

    if (!runtimeNode) return <></>;
    const renderInputs = runtimeNode.inputs.filter((input) => {
      if (runtimeNode.flowNodeType === FlowNodeTypeEnum.pluginInput) return true;
      if (checkInputIsReference(input)) return true;
      if (input.required && !input.value) return true;
    });

    const { register, getValues, setValue, handleSubmit } = useForm<Record<string, any>>({
      defaultValues: renderInputs.reduce((acc: Record<string, any>, input) => {
        const isReference = checkInputIsReference(input);
        if (isReference) {
          acc[input.key] = undefined;
        } else if (typeof input.value === 'object') {
          acc[input.key] = JSON.stringify(input.value, null, 2);
        } else {
          acc[input.key] = input.value;
        }

        return acc;
      }, {})
    });

    const onClose = () => {
      setRuntimeNodeId(undefined);
      setRuntimeNodes(undefined);
      setRuntimeEdges(undefined);
    };

    const onclickRun = (data: Record<string, any>) => {
      onStartNodeDebug({
        entryNodeId: runtimeNode.nodeId,
        runtimeNodes: runtimeNodes.map((node) =>
          node.nodeId === runtimeNode.nodeId
            ? {
                ...runtimeNode,
                inputs: runtimeNode.inputs.map((input) => {
                  let parseValue = (() => {
                    try {
                      if (
                        input.valueType === WorkflowIOValueTypeEnum.string ||
                        input.valueType === WorkflowIOValueTypeEnum.number ||
                        input.valueType === WorkflowIOValueTypeEnum.boolean
                      )
                        return data[input.key];

                      return JSON.parse(data[input.key]);
                    } catch (e) {
                      return data[input.key];
                    }
                  })();

                  return {
                    ...input,
                    value: parseValue ?? input.value
                  };
                })
              }
            : node
        ),
        runtimeEdges: runtimeEdges
      });
      onClose();
    };

    return (
      <MyRightDrawer
        onClose={onClose}
        iconSrc="core/workflow/debugBlue"
        title={t('core.workflow.Debug Node')}
        maxW={['90vw', '35vw']}
        px={0}
      >
        <Box flex={'1 0 0'} overflow={'auto'} px={6}>
          {renderInputs.map((input) => {
            const required = input.required || false;

            const RenderInput = (() => {
              if (input.valueType === WorkflowIOValueTypeEnum.string) {
                return (
                  <Textarea
                    {...register(input.key, {
                      required
                    })}
                    placeholder={t(input.placeholder || '')}
                    bg={'myGray.50'}
                  />
                );
              }
              if (input.valueType === WorkflowIOValueTypeEnum.number) {
                return (
                  <NumberInput step={input.step} min={input.min} max={input.max} bg={'myGray.50'}>
                    <NumberInputField
                      {...register(input.key, {
                        required: input.required,
                        min: input.min,
                        max: input.max,
                        valueAsNumber: true
                      })}
                    />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                );
              }
              if (input.valueType === WorkflowIOValueTypeEnum.boolean) {
                return (
                  <Box>
                    <Switch {...register(input.key)} />
                  </Box>
                );
              }

              let value = getValues(input.key) || '';
              if (typeof value !== 'string') {
                value = JSON.stringify(value, null, 2);
              }

              return (
                <JsonEditor
                  bg={'myGray.50'}
                  placeholder={t(input.placeholder || '')}
                  resize
                  value={value}
                  onChange={(e) => {
                    setValue(input.key, e);
                  }}
                />
              );
            })();

            return !!RenderInput ? (
              <Box key={input.key} _notLast={{ mb: 4 }} px={1}>
                <Flex alignItems={'center'} mb={1}>
                  <Box position={'relative'}>
                    {required && (
                      <Box position={'absolute'} right={-2} top={'-1px'} color={'red.600'}>
                        *
                      </Box>
                    )}
                    {t(input.debugLabel || input.label)}
                  </Box>
                  {input.description && <QuestionTip ml={2} label={input.description} />}
                </Flex>
                {RenderInput}
              </Box>
            ) : null;
          })}
        </Box>
        <Flex py={2} justifyContent={'flex-end'} px={6}>
          <Button onClick={handleSubmit(onclickRun)}>运行</Button>
        </Flex>
      </MyRightDrawer>
    );
  }, [onStartNodeDebug, runtimeEdges, runtimeNodeId, runtimeNodes, t]);

  return {
    DebugInputModal,
    openDebugNode
  };
};

export default function Dom() {
  return <></>;
}
