import { HttpFormFields } from './FormFields';
import React, { useCallback, useMemo, useState } from 'react';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import NodeCard from '../render/NodeCard';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import Container from '../../components/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import {
  Box,
  Flex,
  Button,
  useDisclosure,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  NumberInput
} from '@chakra-ui/react';
import {
  ContentTypes,
  HTTP_METHODS,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { type EditorVariableLabelPickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import dynamic from 'next/dynamic';
import MySelect from '@fastgpt/web/components/common/MySelect';
import RenderToolInput, { useHasDynamicToolInput } from '../render/RenderToolInput';
import IOTitle from '../../components/IOTitle';
import { useMemoizedFn } from 'ahooks';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getEditorVariables } from '../../../utils';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import CatchError from '../render/RenderOutput/CatchError';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { splitNodeOutputs, splitToolInputsByMode } from '@/web/core/workflow/utils';
import { useIsToolNode, useNodeWorkflowDocument } from '../render/useWorkflowDocument';
import { useFieldActions } from '@/web/core/workflow/editor/react/useField';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { WorkflowFieldScope } from '@/web/core/workflow/editor/WorkflowFieldScope';
import { ReferSelector, useReference } from '../render/RenderInput/templates/Reference';

const CurlImportModal = dynamic(() => import('./CurlImportModal'));
const HeaderAuthConfig = dynamic(() => import('@/components/common/secret/HeaderAuthConfig'));

const HTTP_NODE_WIDTH = '666px';

const defaultFormBody = {
  key: NodeInputKeyEnum.httpFormBody,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  valueType: WorkflowIOValueTypeEnum.any,
  value: [],
  label: '',
  required: false
};

enum TabEnum {
  params = 'params',
  headers = 'headers',
  body = 'body'
}
export type PropsArrType = {
  key: string;
  type: string;
  value: string;
};

const RenderHttpMethodAndUrl = React.memo(function RenderHttpMethodAndUrl({
  nodeId,
  inputs
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // 变量列表只读本节点与其上游来源闭包：窄订阅让无关字段的提交不重算也不重渲染。
  const { workflow, getNodeById, graph } = useNodeWorkflowDocument({ nodeId });
  const nodeActions = useNodeActions(nodeId);
  const urlFieldActions = useFieldActions({
    nodeId,
    fieldKey: NodeInputKeyEnum.httpReqUrl,
    kind: 'input'
  });
  const methodFieldActions = useFieldActions({
    nodeId,
    fieldKey: NodeInputKeyEnum.httpMethod,
    kind: 'input'
  });

  const { feConfigs } = useSystemStore();
  const { isOpen: isOpenCurl, onOpen: onOpenCurl, onClose: onCloseCurl } = useDisclosure();

  const requestMethods = inputs.find(
    (item) => item.key === NodeInputKeyEnum.httpMethod
  ) as FlowNodeInputItemType;
  const requestUrl = inputs.find(
    (item) => item.key === NodeInputKeyEnum.httpReqUrl
  ) as FlowNodeInputItemType;

  const onChangeUrl = (value: string) => {
    urlFieldActions.setValue(value);
  };

  /** 失焦时把 url 上的 query 拆进 params：两个字段同一事务提交，撤销一步回到拆分前。 */
  const onBlurUrl = (val: string) => {
    // 拆分params和url
    const url = val.split('?')[0];
    const params = val.split('?')[1];
    if (params) {
      const paramsArr = params.split('&');
      const paramsObj = paramsArr.reduce((acc, cur) => {
        const [key, value] = cur.split('=');
        return {
          ...acc,
          [key]: value
        };
      }, {});
      const inputParams = inputs.find((item) => item.key === NodeInputKeyEnum.httpParams);

      if (!inputParams || Object.keys(paramsObj).length === 0) return;

      const concatParams: PropsArrType[] = inputParams?.value || [];
      Object.entries(paramsObj).forEach(([key, value]) => {
        if (!concatParams.find((item) => item.key === key)) {
          concatParams.push({ key, value: value as string, type: 'string' });
        }
      });

      nodeActions?.updateNode((current) => ({
        inputs: current.inputs.map((input) => {
          if (input.key === NodeInputKeyEnum.httpParams) {
            return { ...input, value: concatParams };
          }
          if (input.key === NodeInputKeyEnum.httpReqUrl) return { ...input, value: url };
          return input;
        })
      }));

      toast({
        status: 'success',
        title: t('common:core.module.http.Url and params have been split')
      });
    }
  };

  const variables = useMemoEnhance(() => {
    if (!workflow || !graph) return [];
    return getEditorVariables({
      nodeId,
      getNodeById,
      chatConfig: workflow.chatConfig,
      t,
      getSourceNodeIds: (sourceNodeId) => graph.getSourceNodeIds({ nodeId: sourceNodeId })
    });
  }, [nodeId, workflow, getNodeById, graph, t]);

  const externalProviderWorkflowVariables = useMemo(() => {
    return (
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  return (
    <Box>
      <Box mb={2} display={'flex'} justifyContent={'space-between'}>
        <FormLabel required={requestUrl?.required} fontWeight={'medium'} color={'myGray.600'}>
          {t('common:core.module.Http request settings')}
        </FormLabel>
        <Button variant={'link'} onClick={onOpenCurl}>
          {t('common:core.module.http.curl import')}
        </Button>
      </Box>
      <Flex alignItems={'center'} className="nodrag">
        <MySelect
          h={'40px'}
          w={'88px'}
          bg={'white'}
          width={'100%'}
          value={requestMethods?.value}
          list={HTTP_METHODS.map((method) => ({ label: method, value: method }))}
          onChange={(e) => {
            methodFieldActions.setValue(e);
          }}
        />
        <Box
          w={'full'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          rounded={'md'}
          bg={'white'}
          ml={2}
        >
          <WorkflowFieldScope nodeId={nodeId} fieldKey={NodeInputKeyEnum.httpReqUrl}>
            <PromptEditor
              placeholder={
                t('common:core.module.input.label.Http Request Url') +
                ', ' +
                t('common:textarea_variable_picker_tip')
              }
              value={requestUrl?.value || ''}
              variableLabels={variables}
              variables={externalProviderWorkflowVariables}
              onBlur={onBlurUrl}
              onChange={onChangeUrl}
              minH={40}
              showOpenModal={false}
            />
          </WorkflowFieldScope>
        </Box>
      </Flex>

      {isOpenCurl && <CurlImportModal nodeId={nodeId} onClose={onCloseCurl} />}
    </Box>
  );
});

export function RenderHttpProps({
  nodeId,
  inputs
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
}) {
  const { t } = useTranslation();
  const [selectedTab, setSelectedTab] = useState(TabEnum.params);

  const { workflow, getNodeById, graph } = useNodeWorkflowDocument({ nodeId });
  const headerSecretFieldActions = useFieldActions({
    nodeId,
    fieldKey: NodeInputKeyEnum.headerSecret,
    kind: 'input'
  });
  const { feConfigs } = useSystemStore();

  const requestMethods = inputs.find((item) => item.key === NodeInputKeyEnum.httpMethod)?.value;
  const params = inputs.find((item) => item.key === NodeInputKeyEnum.httpParams);
  const headers = inputs.find((item) => item.key === NodeInputKeyEnum.httpHeaders);
  const jsonBody = inputs.find((item) => item.key === NodeInputKeyEnum.httpJsonBody);
  const formBody =
    inputs.find((item) => item.key === NodeInputKeyEnum.httpFormBody) || defaultFormBody;
  const headerSecret = inputs.find((item) => item.key === NodeInputKeyEnum.headerSecret)!;
  const contentType = inputs.find((item) => item.key === NodeInputKeyEnum.httpContentType);
  const { referenceList } = useReference({
    nodeId,
    valueType: WorkflowIOValueTypeEnum.string
  });

  const paramsLength = params?.value?.length || 0;
  const headersLength = headers?.value?.length || 0;

  // get variable
  const externalProviderWorkflowVariables = useMemo(() => {
    return (
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  const variables = useMemoEnhance(() => {
    if (!workflow || !graph) return [];
    return getEditorVariables({
      nodeId,
      getNodeById,
      chatConfig: workflow.chatConfig,
      t,
      getSourceNodeIds: (sourceNodeId) => graph.getSourceNodeIds({ nodeId: sourceNodeId })
    });
  }, [nodeId, workflow, getNodeById, graph, t]);

  const variableText = useMemo(() => {
    return variables
      .map((item) => `${item.key}${item.key !== item.label ? `(${item.label})` : ''}`)
      .join('\n');
  }, [variables]);

  const stringifyVariables = useMemo(
    () =>
      JSON.stringify({
        params,
        headers,
        jsonBody,
        variables,
        externalProviderWorkflowVariables
      }),
    [externalProviderWorkflowVariables, headers, jsonBody, params, variables]
  );

  const Render = useMemo(() => {
    const { params, headers, jsonBody, variables, externalProviderWorkflowVariables } =
      JSON.parse(stringifyVariables);
    return (
      <Box>
        <Flex alignItems={'center'} mb={2} fontWeight={'medium'} color={'myGray.600'}>
          {t('common:core.module.Http request props')}
          <QuestionTip
            ml={1}
            label={t('common:core.module.http.Props tip', { variable: variableText })}
          />
          <Flex flex={1} />
          <WorkflowFieldScope nodeId={nodeId} fieldKey={NodeInputKeyEnum.headerSecret}>
            <HeaderAuthConfig
              storeHeaderSecretConfig={headerSecret?.value}
              renderReference={({ value, onChange, buttonProps }) => (
                <ReferSelector
                  list={referenceList}
                  value={value}
                  isArray={false}
                  onSelect={onChange}
                  popDirection={'bottom'}
                  ButtonProps={buttonProps}
                />
              )}
              onUpdate={(data) => {
                headerSecretFieldActions.setValue(data);
              }}
            />
          </WorkflowFieldScope>
        </Flex>
        <LightRowTabs<TabEnum>
          width={'100%'}
          mb={2}
          defaultColor={'myGray.250'}
          list={[
            { label: <RenderPropsItem text="Params" num={paramsLength} />, value: TabEnum.params },
            ...(!['GET', 'DELETE'].includes(requestMethods)
              ? [
                  {
                    label: (
                      <Flex alignItems={'center'}>
                        Body
                        {(jsonBody?.value || !!formBody?.value?.length) &&
                          contentType?.value !== ContentTypes.none && <Box ml={1}>✅</Box>}
                      </Flex>
                    ),
                    value: TabEnum.body
                  }
                ]
              : []),
            {
              label: <RenderPropsItem text="Headers" num={headersLength} />,
              value: TabEnum.headers
            }
          ]}
          value={selectedTab}
          onChange={setSelectedTab}
        />
        <Box minW={'560px'}>
          {params &&
            headers &&
            jsonBody &&
            {
              [TabEnum.params]: (
                <HttpFormFields
                  nodeId={nodeId}
                  input={params}
                  variables={variables}
                  externalProviderWorkflowVariables={externalProviderWorkflowVariables}
                />
              ),
              [TabEnum.body]: (
                <RenderBody
                  nodeId={nodeId}
                  variables={variables}
                  externalProviderWorkflowVariables={externalProviderWorkflowVariables}
                  jsonBody={jsonBody}
                  formBody={formBody}
                  typeInput={contentType}
                />
              ),
              [TabEnum.headers]: (
                <HttpFormFields
                  nodeId={nodeId}
                  input={headers}
                  variables={variables}
                  externalProviderWorkflowVariables={externalProviderWorkflowVariables}
                />
              )
            }[selectedTab]}
        </Box>
      </Box>
    );
  }, [
    contentType,
    formBody,
    headersLength,
    headerSecret,
    headerSecretFieldActions,
    nodeId,
    paramsLength,
    referenceList,
    requestMethods,
    selectedTab,
    stringifyVariables,
    t,
    variableText
  ]);

  return Render;
}
const RenderHttpTimeout = ({
  nodeId,
  inputs
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
}) => {
  const { t } = useTranslation();
  const timeout = inputs.find((item) => item.key === NodeInputKeyEnum.httpTimeout)!;
  const [isEditTimeout, setIsEditTimeout] = useState(false);
  const timeoutFieldActions = useFieldActions({
    nodeId,
    fieldKey: NodeInputKeyEnum.httpTimeout,
    kind: 'input'
  });

  return (
    <Flex alignItems={'center'} justifyContent={'space-between'}>
      <Box fontWeight={'medium'} color={'myGray.600'}>
        {t('common:core.module.Http timeout')}
      </Box>
      <Box>
        {isEditTimeout ? (
          <NumberInput
            defaultValue={timeout.value}
            min={timeout.min}
            max={timeout.max}
            bg={'white'}
            onBlur={() => setIsEditTimeout(false)}
            onChange={(e) => {
              timeoutFieldActions.setValue(Number(e));
            }}
          >
            <NumberInputField autoFocus bg={'white'} px={3} borderRadius={'sm'} />
            <NumberInputStepper>
              <NumberIncrementStepper />
              <NumberDecrementStepper />
            </NumberInputStepper>
          </NumberInput>
        ) : (
          <Button
            variant={'whiteBase'}
            color={'myGray.600'}
            onClick={() => setIsEditTimeout(true)}
          >{`${timeout?.value} s`}</Button>
        )}
      </Box>
    </Flex>
  );
};
const RenderBody = ({
  nodeId,
  jsonBody,
  formBody,
  typeInput,
  variables,
  externalProviderWorkflowVariables
}: {
  nodeId: string;
  jsonBody: FlowNodeInputItemType;
  formBody: FlowNodeInputItemType;
  typeInput: FlowNodeInputItemType | undefined;
  variables: EditorVariableLabelPickerType[];
  externalProviderWorkflowVariables: {
    key: string;
    label: string;
  }[];
}) => {
  const { t } = useTranslation();
  const nodeActions = useNodeActions(nodeId);
  const contentTypeFieldActions = useFieldActions({
    nodeId,
    fieldKey: NodeInputKeyEnum.httpContentType,
    kind: 'input'
  });
  const jsonBodyFieldActions = useFieldActions({ nodeId, fieldKey: jsonBody.key, kind: 'input' });

  const contentType = typeInput?.value ?? ContentTypes.json;
  const setContentType = useCallback(
    (value: string) => {
      if (typeInput) {
        contentTypeFieldActions.setValue(value);
        return;
      }
      // 存量节点缺字段时只在用户切换类型后补入默认项，打开节点不改文档。
      nodeActions?.updateNode((current) => {
        const existing = current.inputs.find(
          (input) => input.key === NodeInputKeyEnum.httpContentType
        );
        return {
          inputs: existing
            ? current.inputs.map((input) => (input === existing ? { ...input, value } : input))
            : current.inputs.concat({
                key: NodeInputKeyEnum.httpContentType,
                renderTypeList: [FlowNodeInputTypeEnum.hidden],
                valueType: WorkflowIOValueTypeEnum.string,
                value,
                label: '',
                required: false
              })
        };
      });
    },
    [contentTypeFieldActions, nodeActions, typeInput]
  );

  const Render = useMemo(() => {
    return (
      <Box>
        <Flex bg={'myGray.50'}>
          {Object.values(ContentTypes).map((item) => (
            <Box
              key={item}
              as={'span'}
              px={3}
              py={1.5}
              mb={2}
              borderRadius={'6px'}
              border={'1px solid'}
              {...(contentType === item
                ? {
                    bg: 'white',
                    borderColor: 'myGray.200',
                    color: 'primary.700'
                  }
                : {
                    bg: 'myGray.50',
                    borderColor: 'transparent',
                    color: 'myGray.500'
                  })}
              _hover={{ bg: 'white', borderColor: 'myGray.200', color: 'primary.700' }}
              onClick={() => {
                setContentType(item);
              }}
              cursor={'pointer'}
              whiteSpace={'nowrap'}
            >
              {item}
            </Box>
          ))}
        </Flex>
        {(contentType === ContentTypes.formData ||
          contentType === ContentTypes.xWwwFormUrlencoded) && (
          <HttpFormFields
            nodeId={nodeId}
            input={formBody}
            allowFiles={contentType === ContentTypes.formData}
            variables={variables}
            externalProviderWorkflowVariables={externalProviderWorkflowVariables}
          />
        )}
        {contentType === ContentTypes.json && (
          <PromptEditor
            bg={'white'}
            showOpenModal={false}
            variableLabels={variables}
            minH={200}
            value={jsonBody.value}
            placeholder={t('workflow:http_body_placeholder')}
            onChange={(e) => {
              jsonBodyFieldActions.setValue(e);
            }}
          />
        )}
        {(contentType === ContentTypes.xml || contentType === ContentTypes.raw) && (
          <PromptEditor
            value={jsonBody.value}
            placeholder={t('common:textarea_variable_picker_tip')}
            onChange={(e) => {
              jsonBodyFieldActions.setValue(e);
            }}
            showOpenModal={false}
            variableLabels={variables}
            minH={200}
          />
        )}
      </Box>
    );
  }, [
    contentType,
    nodeId,
    formBody,
    variables,
    externalProviderWorkflowVariables,
    jsonBody,
    t,
    setContentType,
    jsonBodyFieldActions
  ]);
  return (
    <WorkflowFieldScope nodeId={nodeId} fieldKey={jsonBody.key}>
      {Render}
    </WorkflowFieldScope>
  );
};

const RenderPropsItem = ({ text, num }: { text: string; num: number }) => {
  return (
    <Flex alignItems={'center'}>
      <Box>{text}</Box>
      {num > 0 && (
        <Box ml={1} borderRadius={'50%'} bg={'myGray.200'} px={2} py={'1px'}>
          {num}
        </Box>
      )}
    </Flex>
  );
};

const NodeHttp = ({ data, selected }: CanvasNodeProps) => {
  const { t } = useTranslation();
  const { nodeId } = data;
  const {
    inputs = [],
    outputs = [],
    catchError = false
  } = useNode<WorkflowNodeData>(nodeId, (current) => current?.data) ?? {};
  const hasDynamicInput = useHasDynamicToolInput(nodeId);
  const isTool = useIsToolNode(nodeId);
  const { commonInputs } = useMemoEnhance(
    () => splitToolInputsByMode(inputs, isTool),
    [inputs, isTool]
  );
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitNodeOutputs(outputs),
    [outputs]
  );

  const HttpMethodAndUrl = useMemoizedFn(() => (
    <RenderHttpMethodAndUrl nodeId={nodeId} inputs={inputs} />
  ));
  const Headers = useMemoizedFn(() => <RenderHttpProps nodeId={nodeId} inputs={inputs} />);
  const HttpTimeout = useMemoizedFn(() => <RenderHttpTimeout nodeId={nodeId} inputs={inputs} />);

  const CustomComponents = useMemo(() => {
    return {
      [NodeInputKeyEnum.httpMethod]: HttpMethodAndUrl,
      [NodeInputKeyEnum.httpHeaders]: Headers,
      [NodeInputKeyEnum.httpTimeout]: HttpTimeout
    };
  }, [Headers, HttpMethodAndUrl, HttpTimeout]);

  // console.log(inputs);
  return (
    <NodeCard
      {...data}
      w={HTTP_NODE_WIDTH}
      minW={HTTP_NODE_WIDTH}
      maxW={HTTP_NODE_WIDTH}
      selected={selected}
    >
      {isTool && hasDynamicInput && (
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
          CustomComponent={CustomComponents}
          isTool={isTool}
        />
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
        <RenderOutput flowOutputList={successOutputs} nodeId={nodeId} />
      </Container>
      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}
    </NodeCard>
  );
};
export default React.memo(NodeHttp);
