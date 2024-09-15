import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import { Box, Button, Center, Flex, useDisclosure } from '@chakra-ui/react';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { getLafAppDetail } from '@/web/support/laf/api';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { getApiSchemaByUrl } from '@/web/core/app/api/plugin';
import { getType, str2OpenApiSchema } from '@fastgpt/global/core/app/httpPlugin/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import RenderToolInput from './render/RenderToolInput';
import RenderInput from './render/RenderInput';
import RenderOutput from './render/RenderOutput';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import IOTitle from '../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { putUpdateTeam } from '@/web/support/user/team/api';
import { nodeLafCustomInputConfig } from '@fastgpt/global/core/workflow/template/system/laf';

const LafAccountModal = dynamic(() => import('@/components/support/laf/LafAccountModal'));

const NodeLaf = (props: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { data, selected } = props;
  const { nodeId, inputs, outputs } = data;

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const requestUrl = useMemo(
    () => inputs.find((item) => item.key === NodeInputKeyEnum.httpReqUrl) as FlowNodeInputItemType,
    [inputs]
  );

  const { userInfo, initUserInfo } = useUserStore();

  const token = userInfo?.team.lafAccount?.token;
  const appid = userInfo?.team.lafAccount?.appid;

  const {
    data: lafData,
    isLoading: isLoadingFunctions,
    refetch: refetchFunction
  } = useQuery(
    ['getLafFunctionList'],
    async () => {
      // load laf app detail
      try {
        const appDetail = await getLafAppDetail(appid || '');
        // load laf app functions
        const schemaUrl = `https://${appDetail?.domain.domain}/_/api-docs?token=${appDetail?.openapi_token}`;

        const schema = await getApiSchemaByUrl(schemaUrl);
        const openApiSchema = await str2OpenApiSchema(JSON.stringify(schema));
        const filterPostSchema = openApiSchema.pathData.filter((item) => item.method === 'post');

        return {
          lafApp: appDetail,
          lafFunctions: filterPostSchema.map((item) => ({
            ...item,
            requestUrl: `https://${appDetail?.domain.domain}${item.path}`
          }))
        };
      } catch (err) {
        await putUpdateTeam({
          lafAccount: { token: '', appid: '', pat: '' }
        });
        initUserInfo();
      }
    },
    {
      enabled: !!token && !!appid,
      onError(err) {
        toast({
          status: 'error',
          title: getErrText(err, t('common:get_laf_failed'))
        });
      }
    }
  );

  const lafFunctionSelectList = useMemo(
    () =>
      lafData?.lafFunctions.map((item) => {
        const functionName = item.path.slice(1);
        return {
          alias: functionName,
          label: item.description ? (
            <Box>
              <Box>{functionName}</Box>
              <Box fontSize={'xs'} color={'gray.500'}>
                {item.description}
              </Box>
            </Box>
          ) : (
            functionName
          ),
          value: item.requestUrl
        };
      }) || [],
    [lafData?.lafFunctions]
  );

  const selectedFunction = useMemo(
    () => lafFunctionSelectList.find((item) => item.value === requestUrl?.value)?.value,
    [lafFunctionSelectList, requestUrl?.value]
  );

  const { run: onSyncParams, loading: isSyncing } = useRequest2(
    async () => {
      await refetchFunction();
      const lafFunction = lafData?.lafFunctions.find(
        (item) => item.requestUrl === selectedFunction
      );

      if (!lafFunction) return;

      // update intro
      if (lafFunction.description) {
        onChangeNode({
          nodeId,
          type: 'attr',
          key: 'intro',
          value: lafFunction.description
        });
      }

      // add input variables
      const bodyParams =
        lafFunction?.request?.content?.['application/json']?.schema?.properties || {};
      const requiredParams =
        lafFunction?.request?.content?.['application/json']?.schema?.required || [];

      // add new params
      const allParams = [
        ...Object.keys(bodyParams).map((key) => ({
          name: key,
          desc: bodyParams[key].description,
          required: requiredParams?.includes(key) || false,
          value: `{{${key}}}`,
          type: getType(bodyParams[key])
        }))
      ].filter((item) => !inputs.find((input) => input.key === item.name));

      allParams.forEach((param) => {
        const newInput: FlowNodeInputItemType = {
          key: param.name,
          valueType: param.type,
          label: param.name,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          required: param.required,
          description: param.desc || '',
          toolDescription: param.desc || param.name,
          customInputConfig: nodeLafCustomInputConfig,
          canEdit: true
        };

        onChangeNode({
          nodeId,
          type: 'addInput',
          value: newInput
        });
      });

      /* add output variables */
      const responseParams =
        lafFunction?.response?.default.content?.['application/json'].schema.properties || {};
      const requiredResponseParams =
        lafFunction?.response?.default.content?.['application/json'].schema.required || [];

      const allResponseParams = [
        ...Object.keys(responseParams).map((key) => ({
          valueType: getType(responseParams[key]),
          name: key,
          desc: responseParams[key].description,
          required: requiredResponseParams?.includes(key) || false
        }))
      ].filter((item) => !outputs.find((output) => output.key === item.name));
      allResponseParams.forEach((param) => {
        const newOutput: FlowNodeOutputItemType = {
          id: getNanoid(),
          key: param.name,
          valueType: param.valueType,
          label: param.name,
          type: FlowNodeOutputTypeEnum.dynamic,
          required: param.required,
          description: param.desc || ''
        };
        onChangeNode({
          nodeId,
          type: 'addOutput',
          value: newOutput
        });
      });
    },
    {
      successToast: t('common:common.Sync success')
    }
  );

  const Render = useMemo(() => {
    // not config laf
    if (!token || !appid) {
      return (
        <NodeCard minW={'350px'} selected={selected} {...data}>
          <ConfigLaf />
        </NodeCard>
      );
    } else {
      return (
        <NodeCard minW={'350px'} selected={selected} {...data}>
          <Container>
            {/* select function */}
            <MySelect
              isLoading={isLoadingFunctions}
              list={lafFunctionSelectList}
              placeholder={t('common:core.module.laf.Select laf function')}
              onchange={(e) => {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: NodeInputKeyEnum.httpReqUrl,
                  value: {
                    ...requestUrl,
                    value: e
                  }
                });
              }}
              value={selectedFunction}
            />
            {/* auto set params and go to edit */}
            {!!selectedFunction && (
              <Flex justifyContent={'flex-end'} mt={2} gap={2}>
                <Button
                  isLoading={isSyncing}
                  variant={'grayBase'}
                  size={'sm'}
                  onClick={onSyncParams}
                >
                  {t('common:core.module.Laf sync params')}
                </Button>
                <Button
                  variant={'grayBase'}
                  size={'sm'}
                  onClick={() => {
                    const lafFunction = lafData?.lafFunctions.find(
                      (item) => item.requestUrl === selectedFunction
                    );

                    if (!lafFunction) return;
                    const url = `${feConfigs.lafEnv}/app/${lafData?.lafApp?.appid}/function${lafFunction?.path}?templateid=FastGPT_Laf`;
                    window.open(url, '_blank');
                  }}
                >
                  {t('common:plugin.go to laf')}
                </Button>
              </Flex>
            )}
          </Container>
          {!!selectedFunction && <RenderIO {...props} />}
        </NodeCard>
      );
    }
  }, [
    token,
    appid,
    selected,
    data,
    isLoadingFunctions,
    lafFunctionSelectList,
    t,
    selectedFunction,
    isSyncing,
    onSyncParams,
    props,
    onChangeNode,
    nodeId,
    requestUrl,
    lafData?.lafFunctions,
    lafData?.lafApp?.appid,
    feConfigs.lafEnv
  ]);

  return Render;
};
export default React.memo(NodeLaf);

const ConfigLaf = () => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const {
    isOpen: isOpenLafConfig,
    onOpen: onOpenLafConfig,
    onClose: onCloseLafConfig
  } = useDisclosure();

  return !!feConfigs?.lafEnv ? (
    <Center minH={150}>
      <Button onClick={onOpenLafConfig} variant={'whitePrimary'}>
        {t('common:plugin.Please bind laf accout first')} <ChevronRightIcon />
      </Button>

      {isOpenLafConfig && feConfigs?.lafEnv && (
        <LafAccountModal defaultData={userInfo?.team.lafAccount} onClose={onCloseLafConfig} />
      )}
    </Center>
  ) : (
    <Box>{t('common:no_laf_env')}</Box>
  );
};

const RenderIO = ({ data }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const splitToolInputs = useContextSelector(WorkflowContext, (ctx) => ctx.splitToolInputs);
  const { commonInputs, isTool } = splitToolInputs(inputs, nodeId);

  return (
    <>
      {isTool && (
        <>
          <Container>
            <RenderToolInput nodeId={nodeId} inputs={inputs} />
          </Container>
        </>
      )}
      <>
        <Container>
          <IOTitle text={t('common:common.Input')} />
          <RenderInput nodeId={nodeId} flowInputList={commonInputs} />
        </Container>
      </>
      <>
        <Container>
          <IOTitle text={t('common:common.Output')} />
          <RenderOutput flowOutputList={outputs} nodeId={nodeId} />
        </Container>
      </>
    </>
  );
};
