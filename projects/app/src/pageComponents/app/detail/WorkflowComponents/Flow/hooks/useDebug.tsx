import React from 'react';
import { getGlobalVariableNode } from '@/web/core/workflow/adapt';
import { type RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { storeNodes2RuntimeNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import {
  type RuntimeEdgeItemType,
  type StoreEdgeItemType
} from '@fastgpt/global/core/workflow/type/edge';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useCallback, useMemo, useState } from 'react';

import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import {
  nodeInputTypeToInputType,
  variableInputTypeToInputType
} from '@/components/core/app/formRender/utils';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { Box, Button, Flex } from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { type FieldErrors, useForm } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { useWorkflowPersistence } from '@/web/core/workflow/editor/session/workflowSession';
import {
  useDocumentGetNodeById,
  useGraphQueries,
  useWorkflowSnapshotGetter
} from '../nodes/render/useWorkflowDocument';
import { useWorkflowDebugValue } from '../../debug/workflowDebugSession';
import {
  checkInputShouldRenderInDebug,
  debugNodeShouldShowAllInputs,
  getDebugGlobalVariableFormProps,
  getDebugInputFormProps,
  getDebugInputFormValue,
  getDebugRuntimeInputs,
  getWorkflowStartDebugFileInput,
  getWorkflowStartDebugQuery
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

  // 可引用来源要按 id 查任意节点并展开容器子节点：语义快照提供 edges，
  // 节点查询走 port 的 getNode，子节点走 Runtime 图查询，app 侧不再自建索引。
  // 三者都是非订阅读取：useDebug 挂在每个节点的 MenuRender 上，订阅语义快照会让
  // 任意一笔字段提交带动全部节点菜单重渲染，而来源列表只在抽屉打开后才需要。
  const getWorkflow = useWorkflowSnapshotGetter();
  const getNodeById = useDocumentGetNodeById();
  const graph = useGraphQueries();
  const onStartNodeDebug = useWorkflowDebugValue((v) => v.onStartNodeDebug);
  const setDebugChatId = useWorkflowDebugValue((v) => v.setDebugChatId);
  const onOpenNodeDebug = useWorkflowDebugValue((v) => v.onOpenNodeDebug);
  // 调试输入改读 host 出站边界（与保存发布同一个 codec）。
  const { serializeWorkflowAndCheck } = useWorkflowPersistence();

  const [defaultGlobalVariables, setDefaultGlobalVariables] = useState<Record<string, any>>(() =>
    (getWorkflow()?.chatConfig?.variables ?? []).reduce(
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

  const openDebugNode = useCallback(
    async ({ entryNodeId }: { entryNodeId: string }) => {
      // 每次打开调试弹窗生成独立的会话 chatId，文件上传与调试运行共用，保证文件归属校验通过
      setDebugChatId(getNanoid());

      // 只清上一轮 debug session 写过 overlay 的节点，不再对整份画布做全量清除
      onOpenNodeDebug();
      const serialized = await serializeWorkflowAndCheck();
      if (!serialized) return;
      const { nodes, edges }: { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] } =
        serialized;

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
    [serializeWorkflowAndCheck, onOpenNodeDebug, setDebugChatId]
  );

  const DebugInputModal = useCallback(() => {
    if (!runtimeNodes || !runtimeEdges) return <></>;

    const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.node);
    const fileUploading = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploading);

    const runtimeNode = runtimeNodes.find((node) => node.nodeId === runtimeNodeId);

    if (!runtimeNode) return <></>;
    const workflow = getWorkflow();
    const chatConfig = workflow?.chatConfig;
    const variables = chatConfig?.variables ?? [];
    const debugFileSelectConfig = chatConfig?.fileSelectConfig
      ? {
          ...chatConfig.fileSelectConfig,
          customFileExtensionList: chatConfig.fileSelectConfig.customFileExtensionList?.map(
            (item) => item
          )
        }
      : undefined;
    const getFormVariable = (item: (typeof variables)[number]) =>
      getDebugGlobalVariableFormProps({
        ...item,
        list: item.list?.map((option) => ({ ...option })),
        enums: item.enums?.map((option) => ({ ...option })),
        markList: item.markList?.map((option) => ({ ...option })),
        customFileExtensionList: item.customFileExtensionList?.map((item) => item),
        datasetOptions: item.datasetOptions?.map((dataset) => ({
          ...dataset,
          vectorModel: { ...dataset.vectorModel }
        })),
        customInputConfig: item.customInputConfig
          ? {
              ...item.customInputConfig,
              selectValueTypeList: item.customInputConfig.selectValueTypeList
                ? [...item.customInputConfig.selectValueTypeList]
                : undefined
            }
          : undefined
      });
    const filteredVar = variables.filter(
      (item) => item.type !== VariableInputEnum.custom && item.type !== VariableInputEnum.internal
    );
    const customVar = variables.filter((item) => item.type === VariableInputEnum.custom);
    const internalVar = variables.filter((item) => item.type === VariableInputEnum.internal);
    const referenceSourceNodes = [
      ...(graph?.getSourceNodeIds({ nodeId: runtimeNode.nodeId, includeChildren: true }) ?? [])
        .map((sourceNodeId) => getNodeById(sourceNodeId))
        .filter((sourceNode): sourceNode is NonNullable<typeof sourceNode> => !!sourceNode)
        .map((sourceNode) => ({
          nodeId: sourceNode.nodeId,
          sourceLabel: sourceNode.name,
          icon: sourceNode.avatar,
          outputs: sourceNode.outputs.map((output) => ({ ...output })),
          catchError: sourceNode.catchError
        })),
      getGlobalVariableNode({
        chatConfig: chatConfig as AppChatConfigType,
        t: workflowT
      })
    ];
    const workflowStartFileInput = getWorkflowStartDebugFileInput({
      flowNodeType: runtimeNode.flowNodeType,
      fileSelectConfig: debugFileSelectConfig
    });
    const renderInputs = [
      ...runtimeNode.inputs.filter((input) => {
        return checkInputShouldRenderInDebug(input, {
          showAllInputs: debugNodeShouldShowAllInputs(runtimeNode.flowNodeType),
          referenceSourceNodes
        });
      }),
      ...(workflowStartFileInput ? [workflowStartFileInput] : [])
    ];

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
        variables: data.variables,
        query: getWorkflowStartDebugQuery({
          flowNodeType: runtimeNode.flowNodeType,
          nodeVariables: data.nodeVariables
        })
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
                {...getFormVariable(item)}
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
                {...getFormVariable(item)}
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
                {...getFormVariable(item)}
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
          <Button isDisabled={fileUploading} onClick={handleSubmit(onClickRun, onCheckRunError)}>
            {t('common:Run')}
          </Button>
        </Flex>
      </MyRightDrawer>
    );
  }, [
    runtimeNodes,
    runtimeEdges,
    defaultGlobalVariables,
    t,
    workflowT,
    runtimeNodeId,
    onStartNodeDebug,
    getWorkflow,
    getNodeById,
    graph,
    serializeWorkflowAndCheck
  ]);

  return {
    DebugInputModal,
    openDebugNode
  };
};

export default function Dom() {
  return <></>;
}
