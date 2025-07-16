import React, { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../../components/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import {
  Box,
  Flex,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
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
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { type EditorVariableLabelPickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import dynamic from 'next/dynamic';
import MySelect from '@fastgpt/web/components/common/MySelect';
import RenderToolInput from '../render/RenderToolInput';
import IOTitle from '../../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import { useCreation, useMemoizedFn } from 'ahooks';
import { AppContext } from '@/pageComponents/app/detail/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getEditorVariables } from '../../../utils';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { WorkflowNodeEdgeContext } from '../../../context/workflowInitContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const CurlImportModal = dynamic(() => import('./CurlImportModal'));
const HeaderAuthConfig = dynamic(() => import('@/components/common/secret/HeaderAuthConfig'));

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

  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const { feConfigs } = useSystemStore();
  const { isOpen: isOpenCurl, onOpen: onOpenCurl, onClose: onCloseCurl } = useDisclosure();

  const requestMethods = inputs.find(
    (item) => item.key === NodeInputKeyEnum.httpMethod
  ) as FlowNodeInputItemType;
  const requestUrl = inputs.find(
    (item) => item.key === NodeInputKeyEnum.httpReqUrl
  ) as FlowNodeInputItemType;

  const onChangeUrl = (value: string) => {
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: NodeInputKeyEnum.httpReqUrl,
      value: {
        ...requestUrl,
        value
      }
    });
  };
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

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.httpParams,
        value: {
          ...inputParams,
          value: concatParams
        }
      });

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.httpReqUrl,
        value: {
          ...requestUrl,
          value: url
        }
      });

      toast({
        status: 'success',
        title: t('common:core.module.http.Url and params have been split')
      });
    }
  };

  const variables = useCreation(() => {
    return getEditorVariables({
      nodeId,
      nodeList,
      edges,
      appDetail,
      t
    });
  }, [nodeId, nodeList, edges, appDetail, t]);

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
        <Box fontWeight={'medium'} color={'myGray.600'}>
          {t('common:core.module.Http request settings')}
        </Box>
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
          list={[
            {
              label: 'GET',
              value: 'GET'
            },
            {
              label: 'POST',
              value: 'POST'
            },
            {
              label: 'PUT',
              value: 'PUT'
            },
            {
              label: 'DELETE',
              value: 'DELETE'
            },
            {
              label: 'PATCH',
              value: 'PATCH'
            }
          ]}
          onChange={(e) => {
            onChangeNode({
              nodeId,
              type: 'updateInput',
              key: NodeInputKeyEnum.httpMethod,
              value: {
                ...requestMethods,
                value: e
              }
            });
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
        </Box>
      </Flex>

      {isOpenCurl && <CurlImportModal nodeId={nodeId} inputs={inputs} onClose={onCloseCurl} />}
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

  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { feConfigs } = useSystemStore();

  const requestMethods = inputs.find((item) => item.key === NodeInputKeyEnum.httpMethod)?.value;
  const params = inputs.find((item) => item.key === NodeInputKeyEnum.httpParams);
  const headers = inputs.find((item) => item.key === NodeInputKeyEnum.httpHeaders);
  const jsonBody = inputs.find((item) => item.key === NodeInputKeyEnum.httpJsonBody);
  const formBody =
    inputs.find((item) => item.key === NodeInputKeyEnum.httpFormBody) || defaultFormBody;
  const headerSecret = inputs.find((item) => item.key === NodeInputKeyEnum.headerSecret)!;
  const contentType = inputs.find((item) => item.key === NodeInputKeyEnum.httpContentType);

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

  const variables = useCreation(() => {
    return getEditorVariables({
      nodeId,
      nodeList,
      edges,
      appDetail,
      t
    });
  }, [nodeId, nodeList, edges, appDetail, t]);

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
          <HeaderAuthConfig
            storeHeaderSecretConfig={headerSecret?.value}
            onUpdate={(data) => {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: NodeInputKeyEnum.headerSecret,
                value: {
                  ...headerSecret,
                  value: data
                }
              });
            }}
          />
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
                <RenderForm
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
                <RenderForm
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
    nodeId,
    onChangeNode,
    paramsLength,
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
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

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
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: NodeInputKeyEnum.httpTimeout,
                value: {
                  ...timeout,
                  value: Number(e)
                }
              });
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
const RenderForm = ({
  nodeId,
  input,
  variables,
  externalProviderWorkflowVariables
}: {
  nodeId: string;
  input: FlowNodeInputItemType;
  variables: EditorVariableLabelPickerType[];
  externalProviderWorkflowVariables: {
    key: string;
    label: string;
  }[];
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const [list, setList] = useState<PropsArrType[]>(input.value || []);
  const [updateTrigger, setUpdateTrigger] = useState(false);
  const [shouldUpdateNode, setShouldUpdateNode] = useState(false);

  useEffect(() => {
    setList(input.value || []);
  }, [input.value]);

  useEffect(() => {
    if (shouldUpdateNode) {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: input.key,
        value: {
          ...input,
          value: list
        }
      });
      setShouldUpdateNode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const handleKeyChange = useCallback(
    (index: number, newKey: string) => {
      setList((prevList) => {
        if (!newKey) {
          setUpdateTrigger((prev) => !prev);
          // toast({
          //   status: 'warning',
          //   title: t('common:core.module.http.Key cannot be empty')
          // });
        } else if (prevList.find((item, i) => i !== index && item.key == newKey)) {
          setUpdateTrigger((prev) => !prev);
          toast({
            status: 'warning',
            title: t('common:core.module.http.Key already exists')
          });
        }
        return prevList.map((item, i) => (i === index ? { ...item, key: newKey } : item));
      });
      setShouldUpdateNode(true);
    },
    [t, toast]
  );

  // Add new params/headers key
  const handleAddNewProps = useCallback(
    (value: string) => {
      setList((prevList) => {
        if (!value) {
          return prevList;
        }

        const checkExist = prevList.find((item) => item.key === value);
        if (checkExist) {
          setUpdateTrigger((prev) => !prev);
          toast({
            status: 'warning',
            title: t('common:core.module.http.Key already exists')
          });
          return prevList;
        }
        return [...prevList, { key: value, type: 'string', value: '' }];
      });

      setShouldUpdateNode(true);
    },
    [t, toast]
  );

  const Render = useMemo(() => {
    return (
      <Box
        borderRadius={'md'}
        overflow={'hidden'}
        borderWidth={'1px'}
        borderBottom={'none'}
        bg={'white'}
      >
        <TableContainer overflowY={'visible'} overflowX={'unset'}>
          <Table>
            <Thead>
              <Tr>
                <Th px={2} borderBottomLeftRadius={'none !important'}>
                  {t('common:core.module.http.Props name')}
                </Th>
                <Th px={2} borderBottomRadius={'none !important'}>
                  {t('common:core.module.http.Props value')}
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {[...list, { key: '', value: '', label: '' }].map((item, index) => (
                <Tr key={`${input.key}${index}`}>
                  <Td p={0} w={'50%'} borderRight={'1px solid'} borderColor={'myGray.200'}>
                    <HttpInput
                      placeholder={t('common:textarea_variable_picker_tip')}
                      value={item.key}
                      variableLabels={variables}
                      variables={externalProviderWorkflowVariables}
                      onBlur={(val) => {
                        handleKeyChange(index, val);

                        // Last item blur, add the next item.
                        if (index === list.length && val) {
                          handleAddNewProps(val);
                          setUpdateTrigger((prev) => !prev);
                        }
                      }}
                      updateTrigger={updateTrigger}
                    />
                  </Td>
                  <Td p={0} w={'50%'}>
                    <Box display={'flex'} alignItems={'center'}>
                      <HttpInput
                        placeholder={t('common:textarea_variable_picker_tip')}
                        value={item.value}
                        variables={externalProviderWorkflowVariables}
                        variableLabels={variables}
                        onBlur={(val) => {
                          setList((prevList) =>
                            prevList.map((item, i) =>
                              i === index ? { ...item, value: val } : item
                            )
                          );
                          setShouldUpdateNode(true);
                        }}
                      />
                      {index !== list.length && (
                        <MyIcon
                          name={'delete'}
                          cursor={'pointer'}
                          _hover={{ color: 'red.600' }}
                          w={'14px'}
                          onClick={() => {
                            setList((prevlist) => prevlist.filter((val) => val.key !== item.key));
                            setShouldUpdateNode(true);
                          }}
                        />
                      )}
                    </Box>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </Box>
    );
  }, [
    externalProviderWorkflowVariables,
    handleAddNewProps,
    handleKeyChange,
    input.key,
    list,
    t,
    updateTrigger,
    variables
  ]);

  return Render;
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
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const [_, startSts] = useTransition();

  useEffect(() => {
    if (typeInput === undefined) {
      onChangeNode({
        nodeId,
        type: 'addInput',
        value: {
          key: NodeInputKeyEnum.httpContentType,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.string,
          value: ContentTypes.json,
          label: '',
          required: false
        }
      });
    }
  }, [nodeId, onChangeNode, typeInput]);

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
              {...(typeInput?.value === item
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
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: NodeInputKeyEnum.httpContentType,
                  value: {
                    key: NodeInputKeyEnum.httpContentType,
                    renderTypeList: [FlowNodeInputTypeEnum.hidden],
                    valueType: WorkflowIOValueTypeEnum.string,
                    value: item,
                    label: '',
                    required: false
                  }
                });
              }}
              cursor={'pointer'}
              whiteSpace={'nowrap'}
            >
              {item}
            </Box>
          ))}
        </Flex>
        {(typeInput?.value === ContentTypes.formData ||
          typeInput?.value === ContentTypes.xWwwFormUrlencoded) && (
          <RenderForm
            nodeId={nodeId}
            input={formBody}
            variables={variables}
            externalProviderWorkflowVariables={externalProviderWorkflowVariables}
          />
        )}
        {typeInput?.value === ContentTypes.json && (
          <PromptEditor
            bg={'white'}
            showOpenModal={false}
            variableLabels={variables}
            minH={200}
            value={jsonBody.value}
            placeholder={t('workflow:http_body_placeholder')}
            onChange={(e) => {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: jsonBody.key,
                value: {
                  ...jsonBody,
                  value: e
                }
              });
            }}
          />
        )}
        {(typeInput?.value === ContentTypes.xml || typeInput?.value === ContentTypes.raw) && (
          <PromptEditor
            value={jsonBody.value}
            placeholder={t('common:textarea_variable_picker_tip')}
            onChange={(e) => {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: jsonBody.key,
                value: {
                  ...jsonBody,
                  value: e
                }
              });
            }}
            showOpenModal={false}
            variableLabels={variables}
            minH={200}
          />
        )}
      </Box>
    );
  }, [
    typeInput?.value,
    nodeId,
    formBody,
    variables,
    externalProviderWorkflowVariables,
    jsonBody,
    t,
    onChangeNode
  ]);
  return Render;
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

const NodeHttp = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const splitToolInputs = useContextSelector(WorkflowContext, (v) => v.splitToolInputs);
  const { commonInputs, isTool } = splitToolInputs(inputs, nodeId);

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

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      {isTool && (
        <>
          <Container>
            <RenderToolInput nodeId={nodeId} inputs={inputs} />
          </Container>
        </>
      )}
      <>
        <Container>
          <IOTitle text={t('common:Input')} />
          <RenderInput
            nodeId={nodeId}
            flowInputList={commonInputs}
            CustomComponent={CustomComponents}
          />
        </Container>
      </>
      <>
        <Container>
          <IOTitle text={t('common:Output')} />
          <RenderOutput flowOutputList={outputs} nodeId={nodeId} />
        </Container>
      </>
    </NodeCard>
  );
};
export default React.memo(NodeHttp);
