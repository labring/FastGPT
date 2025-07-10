import { storeNodes2RuntimeNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  type RuntimeEdgeItemType,
  type StoreEdgeItemType
} from '@fastgpt/global/core/workflow/type/edge';
import { useCallback, useState, useMemo } from 'react';
import { checkWorkflowNodeAndConnection } from '@/web/core/workflow/utils';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { uiWorkflow2StoreWorkflow } from '../../utils';
import { type RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

import dynamic from 'next/dynamic';
import { Box, Button, Flex } from '@chakra-ui/react';
import { type FieldErrors, useForm } from 'react-hook-form';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { checkInputIsReference } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppContext } from '../../../context';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { WorkflowNodeEdgeContext } from '../../context/workflowInitContext';
import {
  VariableInputItem,
  NodeVariableInputItem
} from '@/components/core/chat/ChatContainer/ChatBox/components/VariableInputItem';

const MyRightDrawer = dynamic(
  () => import('@fastgpt/web/components/common/MyDrawer/MyRightDrawer')
);

enum TabEnum {
  global = 'global',
  node = 'node'
}

export const useDebug = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setNodes);
  const getNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.getNodes);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const onUpdateNodeError = useContextSelector(WorkflowContext, (v) => v.onUpdateNodeError);
  const onStartNodeDebug = useContextSelector(WorkflowContext, (v) => v.onStartNodeDebug);

  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const { filteredVar, customVar, variables } = useMemo(() => {
    const variables = appDetail.chatConfig?.variables || [];
    return {
      filteredVar: variables.filter((item) => item.type !== VariableInputEnum.custom) || [],
      customVar: variables.filter((item) => item.type === VariableInputEnum.custom) || [],
      variables
    };
  }, [appDetail.chatConfig?.variables]);

  const [defaultGlobalVariables, setDefaultGlobalVariables] = useState<Record<string, any>>(
    variables.reduce(
      (acc, item) => {
        acc[item.key] = item.defaultValue;
        return acc;
      },
      {} as Record<string, any>
    )
  );

  const [runtimeNodeId, setRuntimeNodeId] = useState<string>();
  const [runtimeNodes, setRuntimeNodes] = useState<RuntimeNodeItemType[]>();
  const [runtimeEdges, setRuntimeEdges] = useState<RuntimeEdgeItemType[]>();

  const flowData2StoreDataAndCheck = useCallback(async () => {
    const nodes = getNodes();

    const checkResults = checkWorkflowNodeAndConnection({ nodes, edges });
    if (!checkResults) {
      const storeNodes = uiWorkflow2StoreWorkflow({ nodes, edges });

      return JSON.stringify(storeNodes);
    } else {
      checkResults.forEach((nodeId) => onUpdateNodeError(nodeId, true));

      toast({
        status: 'warning',
        title: t('common:core.workflow.Check Failed')
      });
      return Promise.reject();
    }
  }, [edges, getNodes, onUpdateNodeError, t, toast]);

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

    const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.node);

    const runtimeNode = runtimeNodes.find((node) => node.nodeId === runtimeNodeId);

    if (!runtimeNode) return <></>;
    const renderInputs = runtimeNode.inputs.filter((input) => {
      if (runtimeNode.flowNodeType === FlowNodeTypeEnum.pluginInput) return true;
      if (checkInputIsReference(input)) return true;
      if (input.required && !input.value) return true;
    });

    const variablesForm = useForm<Record<string, any>>({
      defaultValues: {
        nodeVariables: renderInputs.reduce((acc: Record<string, any>, input) => {
          const isReference = checkInputIsReference(input);
          if (isReference) {
            acc[input.key] = undefined;
          } else if (typeof input.value === 'object') {
            acc[input.key] = JSON.stringify(input.value, null, 2);
          } else {
            acc[input.key] = input.value;
          }

          return acc;
        }, {}),
        variables: defaultGlobalVariables
      }
    });
    const { handleSubmit } = variablesForm;

    const onClose = () => {
      setRuntimeNodeId(undefined);
      setRuntimeNodes(undefined);
      setRuntimeEdges(undefined);
    };

    const onClickRun = (data: Record<string, any>) => {
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
                      ) {
                        return data.nodeVariables[input.key];
                      }

                      return JSON.parse(data.nodeVariables[input.key]);
                    } catch (e) {
                      return data.nodeVariables[input.key];
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
        runtimeEdges: runtimeEdges,
        variables: data.variables
      });

      // Filter global variables and set them as default global variable values
      setDefaultGlobalVariables(data.variables);

      onClose();
    };

    const onCheckRunError = useCallback((e: FieldErrors<Record<string, any>>) => {
      const hasRequiredNodeVar =
        e.nodeVariables && Object.values(e.nodeVariables).some((item) => item.type === 'required');

      if (hasRequiredNodeVar) {
        return setCurrentTab(TabEnum.node);
      }

      const hasRequiredGlobalVar =
        e.variables && Object.values(e.variables).some((item) => item.type === 'required');

      if (hasRequiredGlobalVar) {
        setCurrentTab(TabEnum.global);
      }
    }, []);

    return (
      <MyRightDrawer
        onClose={onClose}
        iconSrc="core/workflow/debugBlue"
        title={t('common:core.workflow.Debug Node')}
        maxW={['90vw', '35vw']}
        px={0}
      >
        <Box flex={'1 0 0'} overflow={'auto'} px={6}>
          {variables.length > 0 && (
            <LightRowTabs<TabEnum>
              gap={3}
              ml={-2}
              mb={5}
              inlineStyles={{}}
              list={[
                { label: t('workflow:Node_variables'), value: TabEnum.node },
                { label: t('common:core.module.Variable'), value: TabEnum.global }
              ]}
              value={currentTab}
              onChange={setCurrentTab}
            />
          )}
          <Box display={currentTab === TabEnum.global ? 'block' : 'none'}>
            {customVar.map((item) => (
              <VariableInputItem key={item.id} item={item} variablesForm={variablesForm} />
            ))}
            {filteredVar.map((item) => (
              <VariableInputItem key={item.id} item={item} variablesForm={variablesForm} />
            ))}
          </Box>
          <Box display={currentTab === TabEnum.node ? 'block' : 'none'}>
            {renderInputs.map((item) => (
              <NodeVariableInputItem key={item.key} item={item} variablesForm={variablesForm} />
            ))}
          </Box>
        </Box>
        <Flex py={2} justifyContent={'flex-end'} px={6}>
          <Button onClick={handleSubmit(onClickRun, onCheckRunError)}>{t('common:Run')}</Button>
        </Flex>
      </MyRightDrawer>
    );
  }, [
    runtimeNodes,
    runtimeEdges,
    defaultGlobalVariables,
    t,
    variables.length,
    customVar,
    filteredVar,
    runtimeNodeId,
    onStartNodeDebug
  ]);

  return {
    DebugInputModal,
    openDebugNode
  };
};

export default function Dom() {
  return <></>;
}
