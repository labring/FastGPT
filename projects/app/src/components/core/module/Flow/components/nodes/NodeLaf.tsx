import React, { useEffect, useMemo, useState } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import { Box, Button, Center, Flex, Spinner } from '@chakra-ui/react';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { onChangeNode, useFlowProviderStore } from '../../FlowProvider';
import { useTranslation } from 'next-i18next';
import { getLafAppDetail } from '@/web/support/laf/api';
import RenderToolInput from '../render/RenderToolInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getApiSchemaByUrl } from '@/web/core/plugin/api';
import { str2OpenApiSchema } from '@fastgpt/global/core/plugin/httpPlugin/utils';
import { upperCase } from 'lodash';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { useToast } from '@fastgpt/web/hooks/useToast';

type TAppDetail = {
  domain: {
    domain: string;
    appid: string;
  };
};

type TFunc = {
  name: string;
  path: string;
  description: string;
  method: string;
  params: any[];
  request: any;
};

const NodeLaf = ({ data, selected }: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const { moduleId, inputs, outputs } = data;
  const { splitToolInputs, hasToolNode } = useFlowProviderStore();
  const { commonInputs, toolInputs } = splitToolInputs(inputs, moduleId);
  const { feConfigs } = useSystemStore();

  const requestUrl = inputs.find((item) => item.key === ModuleInputKeyEnum.httpReqUrl);
  const requestMethods = inputs.find((item) => item.key === ModuleInputKeyEnum.httpMethod);

  const [currentFunc, setCurrentFunc] = useState<TFunc | null>(null);
  const [appDetailData, setAppDetailData] = useState<TAppDetail | null>(null);
  const [funcList, setFuncList] = useState<TFunc[]>([]);

  const { toast } = useToast();
  const { userInfo } = useUserStore();

  const lafEnv = feConfigs.lafEnv || '';
  const token = useMemo(() => userInfo?.team.lafAccount?.token || '', [userInfo]);
  const appid = useMemo(() => userInfo?.team.lafAccount?.appid || '', [userInfo]);

  const { mutate: getFuncList, isLoading: isLoadingAppApi } = useRequest({
    mutationFn: async (appid) => {
      const appDetail = await getLafAppDetail(lafEnv, token, appid);
      setAppDetailData(appDetail?.data.data);
      const schemaUrl = appDetail?.data.data
        ? `https://${appDetail?.data.data.domain.domain}/_/api-docs?token=${appDetail?.data.data.openapi_token}`
        : '';
      if (!schemaUrl || !schemaUrl.startsWith('https://')) {
        return toast({
          title: t('plugin.Invalid URL'),
          status: 'warning'
        });
      }
      const schema = await getApiSchemaByUrl(schemaUrl);
      const openApiSchema = await str2OpenApiSchema(JSON.stringify(schema));
      setFuncList(openApiSchema.pathData.filter((item) => item.method === 'post'));
    },
    errorToast: t('plugin.Invalid Schema')
  });

  useEffect(() => {
    const initFunc = requestUrl?.value?.match(/\/([^\/?#]+)(?:\?|#|$)/)[1];
    const initMethod = requestMethods?.value;
    setCurrentFunc(funcList.find((func) => func.name === `${initFunc}_${initMethod}`) || null);
  }, [funcList, requestMethods, requestUrl?.value]);

  useEffect(() => {
    if (appid && token) {
      getFuncList(appid);
    }
  }, [appid, getFuncList, token]);

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      {!userInfo?.team.lafAccount?.appid ? (
        <Center minH={200}>
          <Button variant={'link'} onClick={() => window.open('/account')}>
            {t('plugin.Please bind laf accout first')} <ChevronRightIcon />
          </Button>
        </Center>
      ) : (
        <>
          <Container>
            <Box w={'full'}>
              <Box>
                {isLoadingAppApi ? (
                  <Center>
                    <Spinner />
                  </Center>
                ) : (
                  <>
                    <MySelect
                      list={
                        funcList.map((func) => ({
                          label: func.description
                            ? `${func.name} (${func.description})`
                            : func.name,
                          value: func.name
                        })) || []
                      }
                      placeholder={t('plugin.Func')}
                      onchange={(e) => {
                        const func = funcList.find((func) => func.name === e);

                        if (func) {
                          const { domain } = appDetailData || {};
                          const { method, path } = func;

                          onChangeNode({
                            moduleId,
                            type: 'updateInput',
                            key: ModuleInputKeyEnum.httpReqUrl,
                            value: {
                              ...requestUrl,
                              value: `https://${domain?.domain || ''}${path || ''}`
                            }
                          });

                          onChangeNode({
                            moduleId,
                            type: 'updateInput',
                            key: ModuleInputKeyEnum.httpMethod,
                            value: {
                              ...requestMethods,
                              value: upperCase(method)
                            }
                          });

                          setCurrentFunc(func);
                        }
                      }}
                      value={currentFunc?.name}
                    />
                    <Flex justifyContent={'flex-end'} mt={2}>
                      <Button
                        variant={'ghost'}
                        size={'sm'}
                        textColor={'myGray.500'}
                        onClick={() => {
                          const bodyParams =
                            currentFunc?.request?.content?.['application/json']?.schema
                              ?.properties || {};

                          const requiredParams =
                            currentFunc?.request?.content?.['application/json']?.schema?.required ||
                            [];

                          const jsonBody = inputs.find(
                            (item) => item.key === ModuleInputKeyEnum.httpJsonBody
                          );

                          const allParams = [
                            ...Object.keys(bodyParams).map((key) => ({
                              name: key,
                              desc: bodyParams[key].description,
                              required: requiredParams?.includes(key) || false,
                              value: `{{${key}}}`,
                              type: 'string'
                            }))
                          ];

                          const paramsObject = [
                            ...allParams,
                            {
                              name: 'systemParams',
                              value: {
                                appId: '{{appId}}',
                                chatId: '{{chatId}}',
                                responseChatItemId: '{{responseChatItemId}}',
                                variables: '{{variables}}',
                                histories: '{{histories}}',
                                cTime: '{{cTime}}'
                              }
                            }
                          ].reduce((obj: { [key: string]: any }, item) => {
                            obj[item.name] = item.value;
                            return obj;
                          }, {});

                          onChangeNode({
                            moduleId,
                            type: 'updateInput',
                            key: ModuleInputKeyEnum.httpJsonBody,
                            value: {
                              ...jsonBody,
                              value: JSON.stringify(paramsObject)
                            }
                          });

                          allParams
                            .filter(
                              (param) =>
                                !(
                                  toolInputs.find((input) => input.key === param.name) ||
                                  commonInputs.find((input) => input.key === param.name)
                                )
                            )
                            .forEach((param) => {
                              onChangeNode({
                                moduleId,
                                type: 'addInput',
                                key: param.name,
                                value: {
                                  key: param.name,
                                  valueType: 'string',
                                  label: param.name,
                                  type: 'target',
                                  required: param.required,
                                  description: param.desc || 'description',
                                  edit: true,
                                  editField: {
                                    key: true,
                                    name: true,
                                    description: true,
                                    required: true,
                                    dataType: true,
                                    inputType: true,
                                    isToolInput: true
                                  },
                                  connected: false,
                                  toolDescription: param.desc || 'description',
                                  value: ''
                                }
                              });
                            });
                        }}
                      >
                        {t('plugin.update params')}
                      </Button>
                      <Button
                        variant={'ghost'}
                        size={'sm'}
                        textColor={'myGray.500'}
                        onClick={() => {
                          const url = `https://${feConfigs.lafEnv}/app/${appDetailData?.domain.appid}/function${currentFunc?.path}`;
                          window.open(url, '_blank');
                        }}
                      >
                        {t('plugin.go to laf')}
                      </Button>
                    </Flex>
                  </>
                )}
              </Box>
            </Box>
          </Container>
          {!isLoadingAppApi && (
            <>
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
                  <RenderInput moduleId={moduleId} flowInputList={commonInputs} />
                </Container>
              </>
              <>
                <Divider text={t('common.Output')} />
                <Container>
                  <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
                </Container>
              </>
            </>
          )}
        </>
      )}
    </NodeCard>
  );
};
export default React.memo(NodeLaf);
