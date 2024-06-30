import React, { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import Container from '../../components/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import {
  Box,
  Flex,
  Input,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import JSONEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import { EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import dynamic from 'next/dynamic';
import MySelect from '@fastgpt/web/components/common/MySelect';
import RenderToolInput from '../render/RenderToolInput';
import IOTitle from '../../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { useMemoizedFn } from 'ahooks';
import { AppContext } from '@/pages/app/detail/components/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
const CurlImportModal = dynamic(() => import('./CurlImportModal'));

export const HttpHeaders = [
  { key: 'A-IM', label: 'A-IM' },
  { key: 'Accept', label: 'Accept' },
  { key: 'Accept-Charset', label: 'Accept-Charset' },
  { key: 'Accept-Encoding', label: 'Accept-Encoding' },
  { key: 'Accept-Language', label: 'Accept-Language' },
  { key: 'Accept-Datetime', label: 'Accept-Datetime' },
  { key: 'Access-Control-Request-Method', label: 'Access-Control-Request-Method' },
  { key: 'Access-Control-Request-Headers', label: 'Access-Control-Request-Headers' },
  { key: 'Authorization', label: 'Authorization' },
  { key: 'Cache-Control', label: 'Cache-Control' },
  { key: 'Connection', label: 'Connection' },
  { key: 'Content-Length', label: 'Content-Length' },
  { key: 'Content-Type', label: 'Content-Type' },
  { key: 'Cookie', label: 'Cookie' },
  { key: 'Date', label: 'Date' },
  { key: 'Expect', label: 'Expect' },
  { key: 'Forwarded', label: 'Forwarded' },
  { key: 'From', label: 'From' },
  { key: 'Host', label: 'Host' },
  { key: 'If-Match', label: 'If-Match' },
  { key: 'If-Modified-Since', label: 'If-Modified-Since' },
  { key: 'If-None-Match', label: 'If-None-Match' },
  { key: 'If-Range', label: 'If-Range' },
  { key: 'If-Unmodified-Since', label: 'If-Unmodified-Since' },
  { key: 'Max-Forwards', label: 'Max-Forwards' },
  { key: 'Origin', label: 'Origin' },
  { key: 'Pragma', label: 'Pragma' },
  { key: 'Proxy-Authorization', label: 'Proxy-Authorization' },
  { key: 'Range', label: 'Range' },
  { key: 'Referer', label: 'Referer' },
  { key: 'TE', label: 'TE' },
  { key: 'User-Agent', label: 'User-Agent' },
  { key: 'Upgrade', label: 'Upgrade' },
  { key: 'Via', label: 'Via' },
  { key: 'Warning', label: 'Warning' },
  { key: 'Dnt', label: 'Dnt' },
  { key: 'X-Requested-With', label: 'X-Requested-With' },
  { key: 'X-CSRF-Token', label: 'X-CSRF-Token' }
];

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
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const { isOpen: isOpenCurl, onOpen: onOpenCurl, onClose: onCloseCurl } = useDisclosure();

  const requestMethods = inputs.find((item) => item.key === NodeInputKeyEnum.httpMethod);
  const requestUrl = inputs.find((item) => item.key === NodeInputKeyEnum.httpReqUrl);

  const onChangeUrl = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: NodeInputKeyEnum.httpReqUrl,
      value: {
        ...requestUrl,
        value: e.target.value
      }
    });
  };
  const onBlurUrl = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
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
        title: t('core.module.http.Url and params have been split')
      });
    }
  };

  return (
    <Box>
      <Box mb={2} display={'flex'} justifyContent={'space-between'}>
        <Box fontWeight={'medium'} color={'myGray.600'}>
          {t('core.module.Http request settings')}
        </Box>
        <Button variant={'link'} onClick={onOpenCurl}>
          {t('core.module.http.curl import')}
        </Button>
      </Box>
      <Flex alignItems={'center'} className="nodrag">
        <MySelect
          h={'34px'}
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
          onchange={(e) => {
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
        <Input
          flex={'1 0 0'}
          ml={2}
          h={'34px'}
          bg={'white'}
          value={requestUrl?.value || ''}
          placeholder={t('core.module.input.label.Http Request Url')}
          fontSize={'xs'}
          onChange={onChangeUrl}
          onBlur={onBlurUrl}
        />
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
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const requestMethods = inputs.find((item) => item.key === NodeInputKeyEnum.httpMethod)?.value;
  const params = inputs.find((item) => item.key === NodeInputKeyEnum.httpParams);
  const headers = inputs.find((item) => item.key === NodeInputKeyEnum.httpHeaders);
  const jsonBody = inputs.find((item) => item.key === NodeInputKeyEnum.httpJsonBody);

  const paramsLength = params?.value?.length || 0;
  const headersLength = headers?.value?.length || 0;

  // get variable
  const variables = useMemo(() => {
    const globalVariables = getWorkflowGlobalVariables({
      nodes: nodeList,
      chatConfig: appDetail.chatConfig,
      t
    });

    const moduleVariables = formatEditorVariablePickerIcon(
      inputs
        .filter((input) => input.canEdit || input.toolDescription)
        .map((item) => ({
          key: item.key,
          label: item.label
        }))
    );

    return [...moduleVariables, ...globalVariables];
  }, [appDetail.chatConfig, inputs, nodeList, t]);

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
        variables
      }),
    [headers, jsonBody, params, variables]
  );

  const Render = useMemo(() => {
    const { params, headers, jsonBody, variables } = JSON.parse(stringifyVariables);
    return (
      <Box>
        <Flex alignItems={'center'} mb={2} fontWeight={'medium'} color={'myGray.600'}>
          {t('core.module.Http request props')}
          <QuestionTip
            ml={1}
            label={t('core.module.http.Props tip', { variable: variableText })}
          ></QuestionTip>
        </Flex>
        <LightRowTabs<TabEnum>
          list={[
            { label: <RenderPropsItem text="Params" num={paramsLength} />, value: TabEnum.params },
            ...(!['GET', 'DELETE'].includes(requestMethods)
              ? [
                  {
                    label: (
                      <Flex alignItems={'center'}>
                        Body
                        {jsonBody?.value && <Box ml={1}>✅</Box>}
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
        <Box bg={'white'} borderRadius={'md'}>
          {params &&
            headers &&
            jsonBody &&
            {
              [TabEnum.params]: (
                <RenderForm
                  nodeId={nodeId}
                  input={params}
                  variables={variables}
                  tabType={TabEnum.params}
                />
              ),
              [TabEnum.body]: <RenderJson nodeId={nodeId} variables={variables} input={jsonBody} />,
              [TabEnum.headers]: (
                <RenderForm
                  nodeId={nodeId}
                  input={headers}
                  variables={variables}
                  tabType={TabEnum.headers}
                />
              )
            }[selectedTab]}
        </Box>
      </Box>
    );
  }, [
    headersLength,
    nodeId,
    paramsLength,
    requestMethods,
    selectedTab,
    stringifyVariables,
    t,
    variableText
  ]);

  return Render;
}
const RenderForm = ({
  nodeId,
  input,
  variables,
  tabType
}: {
  nodeId: string;
  input: FlowNodeInputItemType;
  variables: EditorVariablePickerType[];
  tabType?: TabEnum;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const [list, setList] = useState<PropsArrType[]>(input.value || []);
  const [updateTrigger, setUpdateTrigger] = useState(false);
  const [shouldUpdateNode, setShouldUpdateNode] = useState(false);

  const leftVariables = useMemo(() => {
    return (tabType === TabEnum.headers ? HttpHeaders : variables).filter((variable) => {
      const existVariables = list.map((item) => item.key);
      return !existVariables.includes(variable.key);
    });
  }, [list, tabType, variables]);

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
          toast({
            status: 'warning',
            title: t('core.module.http.Key cannot be empty')
          });
          return prevList;
        }
        const checkExist = prevList.find((item, i) => i !== index && item.key == newKey);
        if (checkExist) {
          setUpdateTrigger((prev) => !prev);
          toast({
            status: 'warning',
            title: t('core.module.http.Key already exists')
          });
          return prevList;
        }
        return prevList.map((item, i) => (i === index ? { ...item, key: newKey } : item));
      });
      setShouldUpdateNode(true);
    },
    [t, toast]
  );

  const handleAddNewProps = useCallback(
    (key: string, value: string = '') => {
      setList((prevList) => {
        if (!key) {
          return prevList;
        }

        const checkExist = prevList.find((item) => item.key === key);
        if (checkExist) {
          setUpdateTrigger((prev) => !prev);
          toast({
            status: 'warning',
            title: t('core.module.http.Key already exists')
          });
          return prevList;
        }
        return [...prevList, { key, type: 'string', value }];
      });

      setShouldUpdateNode(true);
    },
    [t, toast]
  );

  const Render = useMemo(() => {
    return (
      <Box mt={2} borderRadius={'md'} overflow={'hidden'} borderWidth={'1px'} borderBottom={'none'}>
        <TableContainer overflowY={'visible'} overflowX={'unset'}>
          <Table>
            <Thead>
              <Tr>
                <Th px={2} borderBottomLeftRadius={'none !important'}>
                  {t('core.module.http.Props name')}
                </Th>
                <Th px={2} borderBottomRadius={'none !important'}>
                  {t('core.module.http.Props value')}
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {list.map((item, index) => (
                <Tr key={`${input.key}${index}`}>
                  <Td p={0} w={'150px'}>
                    <HttpInput
                      hasVariablePlugin={false}
                      hasDropDownPlugin={tabType === TabEnum.headers}
                      setDropdownValue={(value) => {
                        handleKeyChange(index, value);
                        setUpdateTrigger((prev) => !prev);
                      }}
                      placeholder={t('core.module.http.Props name')}
                      value={item.key}
                      variables={leftVariables}
                      onBlur={(val) => {
                        handleKeyChange(index, val);
                      }}
                      updateTrigger={updateTrigger}
                    />
                  </Td>
                  <Td p={0}>
                    <Box display={'flex'} alignItems={'center'}>
                      <HttpInput
                        placeholder={t('core.module.http.Props value')}
                        value={item.value}
                        variables={variables}
                        onBlur={(val) => {
                          setList((prevList) =>
                            prevList.map((item, i) =>
                              i === index ? { ...item, value: val } : item
                            )
                          );
                          setShouldUpdateNode(true);
                        }}
                      />
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
                    </Box>
                  </Td>
                </Tr>
              ))}
              <Tr>
                <Td p={0} w={'150px'}>
                  <HttpInput
                    hasVariablePlugin={false}
                    hasDropDownPlugin={tabType === TabEnum.headers}
                    setDropdownValue={(val) => {
                      handleAddNewProps(val);
                      setUpdateTrigger((prev) => !prev);
                    }}
                    placeholder={t('core.module.http.Add props')}
                    value={''}
                    variables={leftVariables}
                    updateTrigger={updateTrigger}
                    onBlur={(val) => {
                      handleAddNewProps(val);
                      setUpdateTrigger((prev) => !prev);
                    }}
                  />
                </Td>
                <Td p={0}>
                  <Box display={'flex'} alignItems={'center'}>
                    <HttpInput />
                  </Box>
                </Td>
              </Tr>
            </Tbody>
          </Table>
        </TableContainer>
      </Box>
    );
  }, [
    handleAddNewProps,
    handleKeyChange,
    input.key,
    leftVariables,
    list,
    t,
    tabType,
    updateTrigger,
    variables
  ]);

  return Render;
};
const RenderJson = ({
  nodeId,
  input,
  variables
}: {
  nodeId: string;
  input: FlowNodeInputItemType;
  variables: EditorVariablePickerType[];
}) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const [_, startSts] = useTransition();

  const Render = useMemo(() => {
    return (
      <Box mt={1}>
        <JSONEditor
          bg={'white'}
          defaultHeight={200}
          resize
          value={input.value}
          placeholder={t('core.module.template.http body placeholder')}
          onChange={(e) => {
            startSts(() => {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: input.key,
                value: {
                  ...input,
                  value: e
                }
              });
            });
          }}
          variables={variables}
        />
      </Box>
    );
  }, [input, nodeId, onChangeNode, t, variables]);

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
  const { toolInputs, commonInputs, isTool } = splitToolInputs(inputs, nodeId);

  const HttpMethodAndUrl = useMemoizedFn(() => (
    <RenderHttpMethodAndUrl nodeId={nodeId} inputs={inputs} />
  ));
  const Headers = useMemoizedFn(() => <RenderHttpProps nodeId={nodeId} inputs={inputs} />);

  const CustomComponents = useMemo(() => {
    return {
      [NodeInputKeyEnum.httpMethod]: HttpMethodAndUrl,
      [NodeInputKeyEnum.httpHeaders]: Headers
    };
  }, [Headers, HttpMethodAndUrl]);

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      {isTool && (
        <>
          <Container>
            <IOTitle text={t('core.module.tool.Tool input')} />
            <RenderToolInput nodeId={nodeId} inputs={toolInputs} canEdit />
          </Container>
        </>
      )}
      <>
        <Container>
          <IOTitle text={t('common.Input')} />
          <RenderInput
            nodeId={nodeId}
            flowInputList={commonInputs}
            CustomComponent={CustomComponents}
          />
        </Container>
      </>
      <>
        <Container>
          <IOTitle text={t('common.Output')} />
          <RenderOutput flowOutputList={outputs} nodeId={nodeId} />
        </Container>
      </>
    </NodeCard>
  );
};
export default React.memo(NodeHttp);
