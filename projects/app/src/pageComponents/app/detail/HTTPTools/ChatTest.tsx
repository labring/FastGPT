import { useChatStore } from '@/web/core/chat/context/useChatStore';
import React, { useEffect, useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import ChatItemContextProvider from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { Box, Button, Center, Flex, HStack } from '@chakra-ui/react';
import { cardStyles } from '../constants';
import { useTranslation } from 'next-i18next';
import { type HttpToolConfigType } from '@fastgpt/global/core/app/type';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Markdown from '@/components/Markdown';
import { postRunHTTPTool } from '@/web/core/app/api/tool';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { valueTypeToInputType } from '@/components/core/app/formRender/utils';
import { getNodeInputTypeFromSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import ValueTypeLabel from '../WorkflowComponents/Flow/nodes/render/ValueTypeLabel';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const ChatTest = ({
  currentTool,
  baseUrl,
  headerSecret,
  customHeaders
}: {
  currentTool?: HttpToolConfigType;
  baseUrl: string;
  headerSecret: StoreSecretValueType;
  customHeaders: Record<string, string>;
}) => {
  const { t } = useTranslation();

  const [output, setOutput] = useState<string>('');

  const form = useForm();
  const { handleSubmit, reset } = form;
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('input');

  const tabList = [
    { label: t('common:Input'), value: 'input' as const },
    { label: t('common:Output'), value: 'output' as const }
  ];

  useEffect(() => {
    reset({});
    setOutput('');
  }, [currentTool, reset]);

  const { runAsync: runTool, loading: isRunning } = useRequest2(
    async (data: Record<string, any>) => {
      if (!currentTool) return;
      return postRunHTTPTool({
        baseUrl,
        params: data,
        headerSecret: currentTool.headerSecret || headerSecret,
        toolPath: currentTool.path,
        method: currentTool.method,
        customHeaders: customHeaders,
        staticParams: currentTool.staticParams,
        staticHeaders: currentTool.staticHeaders,
        staticBody: currentTool.staticBody
      });
    },
    {
      onSuccess: (res) => {
        try {
          const resStr = JSON.stringify(res, null, 2);
          setOutput(resStr);
          setActiveTab('output');
        } catch (error) {
          console.error(error);
        }
      }
    }
  );
  console.log(currentTool);

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
        <Flex px={[2, 5]} pb={'17px'}>
          <Box fontSize={['md', 'lg']} fontWeight={'bold'} color={'myGray.900'} mr={3}>
            {t('app:chat_debug')}
          </Box>
          <Box flex={1} />
        </Flex>

        {!currentTool ? (
          <Center>
            <EmptyTip text={t('app:empty_tool_tips')} />
          </Center>
        ) : (
          <>
            <Box px={[2, 5]} mb={6}>
              <LightRowTabs
                gap={4}
                list={tabList}
                value={activeTab}
                onChange={(value) => {
                  setActiveTab(value);
                }}
              />
            </Box>

            {activeTab === 'input' ? (
              <Box flex={1} px={[2, 5]} overflow={'auto'}>
                {Object.keys(currentTool?.inputSchema.properties || {}).length > 0 ? (
                  <>
                    <Box border={'1px solid'} borderColor={'myGray.200'} borderRadius={'8px'} p={3}>
                      {Object.entries(currentTool?.inputSchema.properties || {}).map(
                        ([paramName, paramInfo]) => {
                          const inputType = valueTypeToInputType(
                            getNodeInputTypeFromSchemaInputType({ type: paramInfo.type })
                          );
                          const required = currentTool?.inputSchema.required?.includes(paramName);

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
                              fieldName={paramName}
                              form={form}
                              placeholder={paramName}
                            />
                          );
                        }
                      )}
                    </Box>
                  </>
                ) : (
                  <Box fontWeight={'medium'} pb={4} px={2}>
                    {t('app:this_tool_requires_no_input')}
                  </Box>
                )}

                <Button mt={3} isLoading={isRunning} onClick={handleSubmit(runTool)}>
                  {t('common:Run')}
                </Button>
              </Box>
            ) : (
              <Box flex={1} px={[2, 5]} overflow={'auto'}>
                {output && (
                  <Box>
                    <Markdown source={`~~~json\n${output}`} />
                  </Box>
                )}
              </Box>
            )}
          </>
        )}
      </Box>
    </Flex>
  );
};

const Render = ({
  currentTool,
  baseUrl,
  headerSecret,
  customHeaders
}: {
  currentTool?: HttpToolConfigType;
  baseUrl: string;
  headerSecret: StoreSecretValueType;
  customHeaders: Record<string, string>;
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
    >
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatTest
          currentTool={currentTool}
          baseUrl={baseUrl}
          headerSecret={headerSecret}
          customHeaders={customHeaders}
        />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
