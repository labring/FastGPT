import { storeNodes2RuntimeNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  type RuntimeEdgeItemType,
  type StoreEdgeItemType
} from '@fastgpt/global/core/workflow/type/edge';
import { useCallback, useState, useMemo } from 'react';
import { checkWorkflowNodeAndConnection, getNodeAllSource } from '@/web/core/workflow/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { uiWorkflow2StoreWorkflow } from '../../utils';
import { type RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

import dynamic from 'next/dynamic';
import { Box, Button, Flex } from '@chakra-ui/react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppContext } from '../../../context';
import { useTranslation } from 'next-i18next';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import {
  nodeInputTypeToInputType,
  variableInputTypeToInputType
} from '@/components/core/app/formRender/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { WorkflowDebugContext } from '../../context/workflowDebugContext';
import {
  checkInputShouldRenderInDebug,
  getDebugInputFormProps,
  getDebugInputFormValue,
  getDebugRuntimeInputs
} from './useDebugInput';

const MyRightDrawer = dynamic(
  () => import('@fastgpt/web/components/common/MyDrawer/MyRightDrawer')
);

enum TabEnum {
  global = 'global',
  node = 'node'
}

export const useDebug = () => {
  const { t } = useSafeTranslation();
  const { t: workflowT } = useTranslation();
  const { toast } = useToast();

  const setNodes = useContextSelector(WorkflowBufferDataContext, (v) => v.setNodes);
  const getNodes = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodes);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const systemConfigNode = useContextSelector(WorkflowBufferDataContext, (v) => v.systemConfigNode);
  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);
  const childrenNodeIdListMap = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v.childrenNodeIdListMap
  );
  const { onUpdateNodeError, onRemoveError } = useContextSelector(WorkflowActionsContext, (v) => v);
  const onStartNodeDebug = useContextSelector(WorkflowDebugContext, (v) => v.onStartNodeDebug);

  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const { filteredVar, customVar, internalVar, variables } = useMemo(() => {
    const variables = appDetail.chatConfig?.variables || [];
    return {
      filteredVar:
        variables.filter(
          (item) =>
            item.type !== VariableInputEnum.custom && item.type !== VariableInputEnum.internal
        ) || [],
      customVar: variables.filter((item) => item.type === VariableInputEnum.custom) || [],
      internalVar: variables.filter((item) => item.type === VariableInputEnum.internal) || [],
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
      onRemoveError();
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
  }, [edges, getNodes, onRemoveError, onUpdateNodeError, t, toast]);

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
    const referenceSourceNodes = getNodeAllSource({
      nodeId: runtimeNode.nodeId,
      systemConfigNode,
      getNodeById,
      edges,
      chatConfig: appDetail.chatConfig,
      t: workflowT,
      childrenNodeIdListMap
    });
    const renderInputs = runtimeNode.inputs.filter((input) => {
      return checkInputShouldRenderInDebug(input, {
        showAllInputs: runtimeNode.flowNodeType === FlowNodeTypeEnum.pluginInput,
        referenceSourceNodes
      });
    });

    const variablesForm = useForm<Record<string, any>>({
      defaultValues: {
        nodeVariables: renderInputs.reduce((acc: Record<string, any>, input) => {
          acc[input.key] = getDebugInputFormValue(input);
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
                inputs: getDebugRuntimeInputs({
                  inputs: runtimeNode.inputs,
                  nodeVariables: data.nodeVariables
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
        e.nodeVariables && Object.values(e.nodeVariables).some((item) => item.type === 'validate');

      if (hasRequiredNodeVar) {
        return setCurrentTab(TabEnum.node);
      }

      const hasRequiredGlobalVar =
        e.variables && Object.values(e.variables).some((item) => item.type === 'validate');

      if (hasRequiredGlobalVar) {
        setCurrentTab(TabEnum.global);
      }
    }, []);

    return (
      <MyRightDrawer
        onClose={onClose}
        iconSrc="core/workflow/debugBlue"
        title={t('workflow:debug_test')}
        maxW={['90vw', '40vw']}
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
          <Box display={currentTab === TabEnum.node ? 'block' : 'none'}>
            {renderInputs.map((item) => {
              const inputProps = getDebugInputFormProps(item);

              return (
                <LabelAndFormRender
                  {...inputProps}
                  key={item.key}
                  label={item.debugLabel || item.label}
                  required={item.required}
                  description={t(item.placeholder || item.description)}
                  inputType={nodeInputTypeToInputType(item.renderTypeList)}
                  form={variablesForm}
                  fieldName={`nodeVariables.${item.key}`}
                  bg={'myGray.50'}
                />
              );
            })}
          </Box>
          <Box display={currentTab === TabEnum.global ? 'block' : 'none'}>
            {customVar.map((item) => (
              <LabelAndFormRender
                {...item}
                key={item.key}
                label={item.label}
                required={item.required}
                description={t(item.description)}
                inputType={variableInputTypeToInputType(item.type, item.valueType)}
                form={variablesForm}
                fieldName={`variables.${item.key}`}
                bg={'myGray.50'}
              />
            ))}
            {internalVar.map((item) => (
              <LabelAndFormRender
                {...item}
                key={item.key}
                label={item.label}
                required={item.required}
                description={t(item.description)}
                inputType={variableInputTypeToInputType(item.type, item.valueType)}
                form={variablesForm}
                fieldName={`variables.${item.key}`}
                bg={'myGray.50'}
              />
            ))}
            {filteredVar.map((item) => (
              <LabelAndFormRender
                {...item}
                key={item.key}
                label={item.label}
                required={item.required}
                description={item.description}
                inputType={variableInputTypeToInputType(item.type, item.valueType)}
                form={variablesForm}
                fieldName={`variables.${item.key}`}
                bg={'myGray.50'}
              />
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
    workflowT,
    variables.length,
    customVar,
    internalVar,
    filteredVar,
    runtimeNodeId,
    onStartNodeDebug,
    systemConfigNode,
    getNodeById,
    edges,
    appDetail.chatConfig,
    childrenNodeIdListMap
  ]);

  return {
    DebugInputModal,
    openDebugNode
  };
};

export default function Dom() {
  return <></>;
}
