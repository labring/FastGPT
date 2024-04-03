import React, { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Divider from '../../modules/Divider';
import Container from '../../modules/Container';
import RenderInput from '../../render/RenderInput';
import RenderOutput from '../../render/RenderOutput';
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
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { onChangeNode, useFlowProviderStore } from '../../../FlowProvider';
import { useTranslation } from 'next-i18next';
import Tabs from '@/components/Tabs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import JSONEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import {
  formatEditorVariablePickerIcon,
  getGuideModule,
  splitGuideModule
} from '@fastgpt/global/core/module/utils';
import { EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import dynamic from 'next/dynamic';
import MySelect from '@fastgpt/web/components/common/MySelect';
import RenderToolInput from '../../render/RenderToolInput';
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
  moduleId,
  inputs
}: {
  moduleId: string;
  inputs: FlowNodeInputItemType[];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [_, startSts] = useTransition();

  const { isOpen: isOpenCurl, onOpen: onOpenCurl, onClose: onCloseCurl } = useDisclosure();

  const requestMethods = inputs.find((item) => item.key === ModuleInputKeyEnum.httpMethod);
  const requestUrl = inputs.find((item) => item.key === ModuleInputKeyEnum.httpReqUrl);

  const onChangeUrl = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpReqUrl,
        value: {
          ...requestUrl,
          value: e.target.value
        }
      });
    },
    [moduleId, requestUrl]
  );
  const onBlurUrl = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const inputParams = inputs.find((item) => item.key === ModuleInputKeyEnum.httpParams);

        if (!inputParams || Object.keys(paramsObj).length === 0) return;

        const concatParams: PropsArrType[] = inputParams?.value || [];
        Object.entries(paramsObj).forEach(([key, value]) => {
          if (!concatParams.find((item) => item.key === key)) {
            concatParams.push({ key, value: value as string, type: 'string' });
          }
        });

        onChangeNode({
          moduleId,
          type: 'updateInput',
          key: ModuleInputKeyEnum.httpParams,
          value: {
            ...inputParams,
            value: concatParams
          }
        });

        onChangeNode({
          moduleId,
          type: 'updateInput',
          key: ModuleInputKeyEnum.httpReqUrl,
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
    },
    [inputs, moduleId, requestUrl, t, toast]
  );

  return (
    <Box>
      <Box mb={2} display={'flex'} justifyContent={'space-between'}>
        <Box>{t('core.module.Http request settings')}</Box>
        <Button variant={'link'} onClick={onOpenCurl}>
          {t('core.module.http.curl import')}
        </Button>
      </Box>
      <Flex alignItems={'center'} className="nodrag">
        <MySelect
          h={'34px'}
          w={'88px'}
          bg={'myGray.50'}
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
              moduleId,
              type: 'updateInput',
              key: ModuleInputKeyEnum.httpMethod,
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
          value={requestUrl?.value}
          placeholder={t('core.module.input.label.Http Request Url')}
          fontSize={'xs'}
          onChange={onChangeUrl}
          onBlur={onBlurUrl}
        />
      </Flex>

      {isOpenCurl && <CurlImportModal moduleId={moduleId} inputs={inputs} onClose={onCloseCurl} />}
    </Box>
  );
});

export function RenderHttpProps({
  moduleId,
  inputs
}: {
  moduleId: string;
  inputs: FlowNodeInputItemType[];
}) {
  const { t } = useTranslation();
  const [selectedTab, setSelectedTab] = useState(TabEnum.params);
  const { nodes } = useFlowProviderStore();

  const requestMethods = inputs.find((item) => item.key === ModuleInputKeyEnum.httpMethod)?.value;
  const params = inputs.find((item) => item.key === ModuleInputKeyEnum.httpParams);
  const headers = inputs.find((item) => item.key === ModuleInputKeyEnum.httpHeaders);
  const jsonBody = inputs.find((item) => item.key === ModuleInputKeyEnum.httpJsonBody);

  const paramsLength = params?.value?.length || 0;
  const headersLength = headers?.value?.length || 0;

  // get variable
  const variables = useMemo(() => {
    const globalVariables = formatEditorVariablePickerIcon(
      splitGuideModule(getGuideModule(nodes.map((node) => node.data)))?.variableModules || []
    );
    const systemVariables = [
      {
        key: 'appId',
        label: t('core.module.http.AppId')
      },
      {
        key: 'chatId',
        label: t('core.module.http.ChatId')
      },
      {
        key: 'responseChatItemId',
        label: t('core.module.http.ResponseChatItemId')
      },
      {
        key: 'variables',
        label: t('core.module.http.Variables')
      },
      {
        key: 'histories',
        label: t('core.module.http.Histories')
      },
      {
        key: 'cTime',
        label: t('core.module.http.Current time')
      }
    ];
    const moduleVariables = formatEditorVariablePickerIcon(
      inputs
        .filter((input) => input.edit || input.toolDescription)
        .map((item) => ({
          key: item.key,
          label: item.label
        }))
    );

    return [...moduleVariables, ...globalVariables, ...systemVariables];
  }, [inputs, nodes, t]);

  const variableText = useMemo(() => {
    return variables
      .map((item) => `${item.key}${item.key !== item.label ? `(${item.label})` : ''}`)
      .join('\n');
  }, [variables]);

  return (
    <Box>
      <Flex alignItems={'center'} mb={2}>
        {t('core.module.Http request props')}
        <MyTooltip label={t('core.module.http.Props tip', { variable: variableText })}>
          <QuestionOutlineIcon ml={1} />
        </MyTooltip>
      </Flex>
      <Tabs
        list={[
          { label: <RenderPropsItem text="Params" num={paramsLength} />, id: TabEnum.params },
          ...(!['GET', 'DELETE'].includes(requestMethods)
            ? [
                {
                  label: (
                    <Flex alignItems={'center'}>
                      Body
                      {jsonBody?.value && <Box ml={1}>✅</Box>}
                    </Flex>
                  ),
                  id: TabEnum.body
                }
              ]
            : []),
          { label: <RenderPropsItem text="Headers" num={headersLength} />, id: TabEnum.headers }
        ]}
        activeId={selectedTab}
        onChange={(e) => setSelectedTab(e as any)}
      />
      {params &&
        headers &&
        jsonBody &&
        {
          [TabEnum.params]: (
            <RenderForm
              moduleId={moduleId}
              input={params}
              variables={variables}
              tabType={TabEnum.params}
            />
          ),
          [TabEnum.body]: <RenderJson moduleId={moduleId} variables={variables} input={jsonBody} />,
          [TabEnum.headers]: (
            <RenderForm
              moduleId={moduleId}
              input={headers}
              variables={variables}
              tabType={TabEnum.headers}
            />
          )
        }[selectedTab]}
    </Box>
  );
}
const RenderForm = ({
  moduleId,
  input,
  variables,
  tabType
}: {
  moduleId: string;
  input: FlowNodeInputItemType;
  variables: EditorVariablePickerType[];
  tabType?: TabEnum;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

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
        moduleId,
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

  const handleKeyChange = (index: number, newKey: string) => {
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
  };

  const handleAddNewProps = (key: string, value: string = '') => {
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
  };

  return (
    <TableContainer overflowY={'visible'} overflowX={'unset'}>
      <Table>
        <Thead>
          <Tr>
            <Th px={2}>{t('core.module.http.Props name')}</Th>
            <Th px={2}>{t('core.module.http.Props value')}</Th>
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
                        prevList.map((item, i) => (i === index ? { ...item, value: val } : item))
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
  );
};
const RenderJson = ({
  moduleId,
  input,
  variables
}: {
  moduleId: string;
  input: FlowNodeInputItemType;
  variables: EditorVariablePickerType[];
}) => {
  const { t } = useTranslation();
  const [_, startSts] = useTransition();

  return (
    <Box mt={1}>
      <JSONEditor
        bg={'myGray.50'}
        defaultHeight={200}
        resize
        value={input.value}
        placeholder={t('core.module.template.http body placeholder')}
        onChange={(e) => {
          startSts(() => {
            onChangeNode({
              moduleId,
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

const NodeHttp = ({ data, selected }: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const { moduleId, inputs, outputs } = data;
  const { splitToolInputs, hasToolNode } = useFlowProviderStore();
  const { toolInputs, commonInputs } = splitToolInputs(inputs, moduleId);

  const CustomComponents = useMemo(
    () => ({
      [ModuleInputKeyEnum.httpMethod]: () => (
        <RenderHttpMethodAndUrl moduleId={moduleId} inputs={inputs} />
      ),
      [ModuleInputKeyEnum.httpHeaders]: () => (
        <>
          <RenderHttpProps moduleId={moduleId} inputs={inputs} />
          <Box mt={2} transform={'translateY(10px)'}>
            {t('core.module.Variable import')}
          </Box>
        </>
      )
    }),
    [inputs, moduleId, t]
  );

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      {hasToolNode && (
        <>
          <Divider text={t('core.module.tool.Tool input')} />
          <Container>
            <RenderToolInput moduleId={moduleId} inputs={toolInputs} canEdit />
          </Container>
        </>
      )}
      <>
        <Divider text={t('common.Input')} />
        <Container>
          <RenderInput
            moduleId={moduleId}
            flowInputList={commonInputs}
            CustomComponent={CustomComponents}
          />
        </Container>
      </>
      <>
        <Divider text={t('common.Output')} />
        <Container>
          <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
        </Container>
      </>
    </NodeCard>
  );
};
export default React.memo(NodeHttp);
