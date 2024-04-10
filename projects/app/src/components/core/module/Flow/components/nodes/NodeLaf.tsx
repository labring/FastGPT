import React, { useCallback, useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Container from '../modules/Container';
import { Box, Button, Center, Flex, useDisclosure } from '@chakra-ui/react';
import { ModuleIOValueTypeEnum, ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { onChangeNode, useFlowProviderStore } from '../../FlowProvider';
import { useTranslation } from 'next-i18next';
import { getLafAppDetail } from '@/web/support/laf/api';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { getApiSchemaByUrl } from '@/web/core/plugin/api';
import { str2OpenApiSchema } from '@fastgpt/global/core/plugin/httpPlugin/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/module/node/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Divider from '../modules/Divider';
import RenderToolInput from '../render/RenderToolInput';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

const LafAccountModal = dynamic(() => import('@/components/support/laf/LafAccountModal'));

const NodeLaf = (props: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { data, selected } = props;
  const { moduleId, inputs, outputs } = data;

  const requestUrl = inputs.find((item) => item.key === ModuleInputKeyEnum.httpReqUrl);

  const { userInfo } = useUserStore();

  const token = userInfo?.team.lafAccount?.token;
  const appid = userInfo?.team.lafAccount?.appid;

  // not config laf
  if (!token || !appid) {
    return (
      <NodeCard minW={'350px'} selected={selected} {...data}>
        <ConfigLaf />
      </NodeCard>
    );
  }

  const {
    data: lafData,
    isLoading: isLoadingFunctions,
    refetch: refetchFunction
  } = useQuery(
    ['getLafFunctionList'],
    async () => {
      // load laf app detail
      const appDetail = await getLafAppDetail(appid);

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
    },
    {
      onError(err) {
        toast({
          status: 'error',
          title: getErrText(err, '获取Laf函数列表失败')
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

  const { mutate: onSyncParams, isLoading: isSyncing } = useRequest({
    mutationFn: async () => {
      await refetchFunction();
      const lafFunction = lafData?.lafFunctions.find(
        (item) => item.requestUrl === selectedFunction
      );

      if (!lafFunction) return;

      // update intro
      if (lafFunction.description) {
        onChangeNode({
          moduleId,
          type: 'attr',
          key: 'intro',
          value: lafFunction.description
        });
      }

      const bodyParams =
        lafFunction?.request?.content?.['application/json']?.schema?.properties || {};

      const requiredParams =
        lafFunction?.request?.content?.['application/json']?.schema?.required || [];

      const allParams = [
        ...Object.keys(bodyParams).map((key) => ({
          name: key,
          desc: bodyParams[key].description,
          required: requiredParams?.includes(key) || false,
          value: `{{${key}}}`,
          type: 'string'
        }))
      ].filter((item) => !inputs.find((input) => input.key === item.name));

      // add params
      allParams.forEach((param) => {
        onChangeNode({
          moduleId,
          type: 'addInput',
          key: param.name,
          value: {
            key: param.name,
            valueType: ModuleIOValueTypeEnum.string,
            label: param.name,
            type: FlowNodeInputTypeEnum.target,
            required: param.required,
            description: param.desc || '',
            toolDescription: param.desc || '未设置参数描述',
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
            connected: false
          }
        });
      });

      const responseParams =
        lafFunction?.response?.default.content?.['application/json'].schema.properties || {};
      const requiredResponseParams =
        lafFunction?.response?.default.content?.['application/json'].schema.required || [];

      const allResponseParams = [
        ...Object.keys(responseParams).map((key) => ({
          valueType: responseParams[key].type,
          name: key,
          desc: responseParams[key].description,
          required: requiredResponseParams?.includes(key) || false
        }))
      ].filter((item) => !outputs.find((output) => output.key === item.name));
      allResponseParams.forEach((param) => {
        onChangeNode({
          moduleId,
          type: 'addOutput',
          key: param.name,
          value: {
            key: param.name,
            valueType: param.valueType,
            label: param.name,
            type: FlowNodeOutputTypeEnum.source,
            required: param.required,
            description: param.desc || '',
            edit: true,
            editField: {
              key: true,
              description: true,
              dataType: true,
              defaultValue: true
            },
            targets: []
          }
        });
      });
    },
    successToast: t('common.Sync success')
  });

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      <Container>
        {/* select function */}
        <MySelect
          isLoading={isLoadingFunctions}
          list={lafFunctionSelectList}
          placeholder={t('core.module.laf.Select laf function')}
          onchange={(e) => {
            onChangeNode({
              moduleId,
              type: 'updateInput',
              key: ModuleInputKeyEnum.httpReqUrl,
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
            <Button isLoading={isSyncing} variant={'grayBase'} size={'sm'} onClick={onSyncParams}>
              {t('core.module.Laf sync params')}
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
              {t('plugin.go to laf')}
            </Button>
          </Flex>
        )}
      </Container>
      {!!selectedFunction && <RenderIO {...props} />}
    </NodeCard>
  );
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
        {t('plugin.Please bind laf accout first')} <ChevronRightIcon />
      </Button>

      {isOpenLafConfig && feConfigs?.lafEnv && (
        <LafAccountModal defaultData={userInfo?.team.lafAccount} onClose={onCloseLafConfig} />
      )}
    </Center>
  ) : (
    <Box>系统未配置Laf环境</Box>
  );
};

const RenderIO = ({ data, selected }: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const { moduleId, inputs, outputs } = data;
  const { splitToolInputs, hasToolNode } = useFlowProviderStore();
  const { commonInputs, toolInputs } = splitToolInputs(inputs, moduleId);

  return (
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
          <Box mb={3}>自定义Body参数</Box>
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
  );
};
