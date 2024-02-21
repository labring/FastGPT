import React, { useCallback, useMemo, useState, useTransition } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
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
  TableContainer
} from '@chakra-ui/react';
import MySelect from '@/components/Select';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { onChangeNode, useFlowProviderStore } from '../../FlowProvider';
import { useTranslation } from 'next-i18next';
import Tabs from '@/components/Tabs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import JSONEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import {
  formatEditorVariablePickerIcon,
  getGuideModule,
  splitGuideModule
} from '@fastgpt/global/core/module/utils';
import { EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';

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
      <Box mb={2}>{t('core.module.Http request settings')}</Box>
      <Flex alignItems={'center'} className="nodrag">
        <MySelect
          h={'34px'}
          w={'80px'}
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

const defaultForm = {
  key: '',
  value: ''
};
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
          ...(requestMethods === 'POST'
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
  const [_, startSts] = useTransition();
  const { register, reset, handleSubmit } = useForm({
    defaultValues: defaultForm
  });

  const list = useMemo(() => (input.value || []) as PropsArrType[], [input.value]);

  const addNewProps = useCallback(
    ({ key, value }: { key: string; value: string }) => {
      const checkExist = list.find((item) => item.key === key);
      if (checkExist) {
        return toast({
          status: 'warning',
          title: t('core.module.http.Key already exists')
        });
      }
      if (!key) return;
      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: input.key,
        value: {
          ...input,
          value: [...list, { key, type: 'string', value }]
        }
      });
      reset(defaultForm);
    },
    [input, list, moduleId, reset, t, toast]
  );

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
                <Input
                  w={'150px'}
                  defaultValue={item.key}
                  variant={'unstyled'}
                  paddingLeft={2}
                  placeholder={t('core.module.http.Props name')}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      return toast({
                        status: 'warning',
                        title: t('core.module.http.Key cannot be empty')
                      });
                    }

                    const checkExist = list.find((item, i) => i !== index && item.key == val);
                    if (checkExist) {
                      return toast({
                        status: 'warning',
                        title: t('core.module.http.Key already exists')
                      });
                    }

                    startSts(() => {
                      onChangeNode({
                        moduleId,
                        type: 'updateInput',
                        key: input.key,
                        value: {
                          ...input,
                          value: list.map((item, i) => (i === index ? { ...item, key: val } : item))
                        }
                      });
                    });
                  }}
                />
              </Td>
              <Td p={0} display={'flex'} alignItems={'center'}>
                <Input
                  flex={'1 0 0'}
                  w={'150px'}
                  defaultValue={item.value}
                  variant={'unstyled'}
                  paddingLeft={2}
                  placeholder={t('core.module.http.Props value')}
                  onBlur={(e) => {
                    const val = e.target.value;
                    startSts(() => {
                      onChangeNode({
                        moduleId,
                        type: 'updateInput',
                        key: input.key,
                        value: {
                          ...input,
                          value: list.map((item, i) =>
                            i === index ? { ...item, value: val } : item
                          )
                        }
                      });
                    });
                  }}
                />
                <MyIcon
                  name={'delete'}
                  cursor={'pointer'}
                  _hover={{ color: 'red.600' }}
                  w={'14px'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeNode({
                      moduleId,
                      type: 'updateInput',
                      key: input.key,
                      value: {
                        ...input,
                        value: list.filter((val) => val.key !== item.key)
                      }
                    });
                  }}
                />
              </Td>
            </Tr>
          ))}
          <Tr>
            <Td p={0} w={'150px'}>
              <Input
                w={'150px'}
                variant={'unstyled'}
                paddingLeft={2}
                placeholder={t('core.module.http.Add props')}
                {...register('key', {
                  onBlur: handleSubmit(addNewProps)
                })}
              />
            </Td>
            <Td p={0}>
              <Input variant={'unstyled'} paddingLeft={2} {...register('value')} />
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
  const [_, startSts] = useTransition();
  return (
    <Box mt={1}>
      <JSONEditor
        bg={'myGray.50'}
        height={200}
        resize
        value={input.value}
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
    <Flex alignItems={'center'} fontSize={'xs'} transform={'scale(0.8)'}>
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
            外部参数输入
          </Box>
        </>
      )
    }),
    [inputs, moduleId]
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
