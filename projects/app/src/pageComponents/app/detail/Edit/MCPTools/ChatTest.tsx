import { useChatStore } from '@/web/core/chat/context/useChatStore';
import React, { useEffect, useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import ChatItemContextProvider from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import { cardStyles } from '../../constants';
import { useTranslation } from 'next-i18next';
import { type McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import { getMcpOAuthErrorCode, getMcpOAuthErrorCopy } from './oauth/utils';
import Markdown from '@/components/Markdown';
import { postRunMCPTool } from '@/web/core/app/api/mcpTools';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { valueTypeToInputType } from '@/components/core/app/formRender/utils';
import { getNodeInputTypeFromSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import ValueTypeLabel from '../../WorkflowComponents/Flow/nodes/render/ValueTypeLabel';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';

const ChatTest = ({
  currentTool,
  url,
  headerSecret,
  appId,
  nodeId,
  authMode = 'headers',
  onReauthRequired
}: {
  currentTool?: McpToolConfigType;
  url: string;
  headerSecret: StoreSecretValueType;
  appId?: string;
  nodeId?: string;
  authMode?: 'headers' | 'oauth';
  /** oauth 模式运行期返回 reauth_required 时刷新既有状态卡（显示「重新授权」）。 */
  onReauthRequired?: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [output, setOutput] = useState<string>('');

  const form = useForm();
  const { handleSubmit, reset } = form;

  useEffect(() => {
    reset({});
    setOutput('');
  }, [currentTool, reset]);

  const { runAsync: runTool, loading: isRunning } = useRequest(
    async (data: Record<string, any>) => {
      if (!currentTool) return;

      // Format type
      Object.entries(currentTool?.inputSchema?.properties || {}).forEach(
        ([paramName, paramInfo]) => {
          const valueType = getNodeInputTypeFromSchemaInputType({
            type: paramInfo.type,
            arrayItems: paramInfo.items
          });
          if (data[paramName] !== undefined) {
            data[paramName] = valueTypeFormat(data[paramName], valueType);
          }
        }
      );

      // oauth 模式由服务端按已保存节点注入/刷新 token，不传 headerSecret。
      if (authMode === 'oauth' && appId) {
        return await postRunMCPTool({
          params: data,
          appId,
          ...(nodeId ? { nodeId } : {}),
          toolName: currentTool.name
        });
      }

      return await postRunMCPTool({
        params: data,
        url,
        headerSecret,
        toolName: currentTool.name
      });
    },
    {
      onSuccess: (res) => {
        try {
          const resStr = JSON.stringify(res, null, 2);
          setOutput(resStr);
        } catch (error) {
          console.error(error);
        }
      },
      // oauth 模式运行期失败按固定错误码出文案；无码时保持原有通用错误提示。
      errorToast: '',
      onError: (error) => {
        const code = getMcpOAuthErrorCode(error);
        if (!code) {
          toast({ title: t(getErrText(error, 'Error')), status: 'error' });
          return;
        }
        const copy = getMcpOAuthErrorCopy(code, t);
        toast({
          title: copy.message,
          description: copy.suggestion || undefined,
          status: 'error'
        });
        if (code === McpOAuthErrorCodeEnum.reauthRequired) {
          onReauthRequired?.();
        }
      }
    }
  );

  return (
    <Flex h={'full'} gap={2}>
      <Box
        flex={'1 0 0'}
        w={0}
        display={'flex'}
        position={'relative'}
        flexDirection={'column'}
        h={'full'}
        py={4}
        {...cardStyles}
        boxShadow={'3'}
      >
        <Flex px={[2, 5]} pb={4}>
          <Box fontSize={['md', 'lg']} fontWeight={'bold'} color={'myGray.900'} mr={3}>
            {t('app:chat_debug')}
          </Box>
          <Box flex={1} />
        </Flex>

        <Box flex={1} px={[2, 5]} overflow={'auto'}>
          {Object.keys(currentTool?.inputSchema?.properties || {}).length > 0 && (
            <>
              <Box color={'myGray.900'} fontSize={'16px'} fontWeight={'medium'} mb={3}>
                {t('common:Input')}
              </Box>
              <Box border={'1px solid'} borderColor={'myGray.200'} borderRadius={'8px'} p={3}>
                {Object.entries(currentTool?.inputSchema?.properties || {}).map(
                  ([paramName, paramInfo]) => {
                    const inputType = valueTypeToInputType(
                      getNodeInputTypeFromSchemaInputType({ type: paramInfo.type })
                    );
                    const required = currentTool?.inputSchema?.required?.includes(paramName);

                    return (
                      <LabelAndFormRender
                        label={
                          <HStack spacing={0} mr={2}>
                            <FormLabel required={required}>{paramName}</FormLabel>
                            <ValueTypeLabel
                              valueType={getNodeInputTypeFromSchemaInputType({
                                type: paramInfo.type,
                                arrayItems: paramInfo.items
                              })}
                              h={'auto'}
                            />
                          </HStack>
                        }
                        required={required}
                        key={paramName}
                        inputType={inputType}
                        form={form}
                        fieldName={paramName}
                        bg={'myGray.50'}
                        description={paramInfo.description}
                      />
                    );
                  }
                )}
              </Box>
            </>
          )}

          <Button mt={3} isLoading={isRunning} onClick={handleSubmit(runTool)}>
            {t('common:Run')}
          </Button>

          {output && (
            <>
              <Box color={'myGray.900'} fontSize={'16px'} fontWeight={'medium'} mb={3} mt={8}>
                {t('common:Output')}
              </Box>
              <Box>
                <Markdown source={`~~~json\n${output}`} />
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Flex>
  );
};

const Render = ({
  currentTool,
  url,
  headerSecret,
  appId,
  nodeId,
  authMode = 'headers',
  onReauthRequired
}: {
  currentTool?: McpToolConfigType;
  url: string;
  headerSecret: StoreSecretValueType;
  appId?: string;
  nodeId?: string;
  authMode?: 'headers' | 'oauth';
  onReauthRequired?: () => void;
}) => {
  const { chatId } = useChatStore();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const chatRecordProviderParams = useMemo(
    () => ({
      chatId: chatId,
      appId: appDetail._id
    }),
    [appDetail._id, chatId]
  );

  return (
    <ChatItemContextProvider
      showRouteToDatasetDetail={true}
      canDownloadSource={true}
      isShowCite={true}
      isShowFullText={true}
      showRunningStatus={true}
      showSkillReferences={true}
      showWholeResponse={true}
    >
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatTest
          currentTool={currentTool}
          url={url}
          headerSecret={headerSecret}
          appId={appId}
          nodeId={nodeId}
          authMode={authMode}
          onReauthRequired={onReauthRequired}
        />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
