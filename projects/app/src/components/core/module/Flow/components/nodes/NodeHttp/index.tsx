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
  Button
} from '@chakra-ui/react';
import MySelect from '@/components/Select';
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
const OpenApiImportModal = dynamic(() => import('./OpenApiImportModal'));

enum TabEnum {
  params = 'params',
  headers = 'headers',
  body = 'body'
}
type PropsArrType = {
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
        <span>{t('core.module.Http request settings')}</span>
        <span>
          <OpenApiImportModal moduleId={moduleId} inputs={inputs}>
            <Button variant={'link'}>{t('core.module.http.OpenAPI import')}</Button>
          </OpenApiImportModal>
        </span>
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
          ml={2}
          h={'34px'}
          value={requestUrl?.value}
          placeholder={t('core.module.input.label.Http Request Url')}
          fontSize={'xs'}
          w={'350px'}
          onChange={onChangeUrl}
          onBlur={onBlurUrl}
        />
      </Flex>
    </Box>
  );
});

function RenderHttpProps({
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
        .filter((input) => input.edit)
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
          [TabEnum.params]: <RenderForm moduleId={moduleId} input={params} variables={variables} />,
          [TabEnum.body]: <RenderJson moduleId={moduleId} variables={variables} input={jsonBody} />,
          [TabEnum.headers]: (
            <RenderForm moduleId={moduleId} input={headers} variables={variables} />
          )
        }[selectedTab]}
    </Box>
  );
}
const RenderForm = ({
  moduleId,
  input,
  variables
}: {
  moduleId: string;
  input: FlowNodeInputItemType;
  variables: EditorVariablePickerType[];
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [list, setList] = useState<PropsArrType[]>(input.value || []);
  const [updateTrigger, setUpdateTrigger] = useState(false);
  const [shouldUpdateNode, setShouldUpdateNode] = useState(false);

  const leftVariables = useMemo(() => {
    return variables.filter((variable) => {
      const existVariables = list.map((item) => item.key);
      return !existVariables.includes(variable.key);
    });
  }, [list, variables]);

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
    const checkExist = list.find((item) => item.key === key);
    if (checkExist) {
      return toast({
        status: 'warning',
        title: t('core.module.http.Key already exists')
      });
    }
    if (!key) return;

    setList((prevList) => [...prevList, { key, type: 'string', value }]);
    setShouldUpdateNode(true);
  };

  return (
    <TableContainer>
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
                  hasDropDownPlugin={true}
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
                hasDropDownPlugin={true}
                setDropdownValue={(val) => {
                  handleAddNewProps(val);
                }}
                placeholder={t('core.module.http.Add props')}
                value={''}
                h={40}
                variables={leftVariables}
                onBlur={(val) => {
                  handleAddNewProps(val);
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
        height={200}
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
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          flowInputList={inputs}
          CustomComponent={CustomComponents}
        />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeHttp);
