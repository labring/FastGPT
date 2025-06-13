import { useChatStore } from '@/web/core/chat/context/useChatStore';
import React, { useEffect, useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import ChatItemContextProvider from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { Box, Button, Flex, Switch, Textarea } from '@chakra-ui/react';
import { cardStyles } from '../constants';
import { useTranslation } from 'react-i18next';
import { type McpToolConfigType } from '@fastgpt/global/core/app/type';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { Controller, useForm } from 'react-hook-form';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import dynamic from 'next/dynamic';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Markdown from '@/components/Markdown';
import { postRunMCPTool } from '@/web/core/app/api/plugin';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';

const JsonEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/JsonEditor'));

const ChatTest = ({
  currentTool,
  url,
  headerSecret
}: {
  currentTool?: McpToolConfigType;
  url: string;
  headerSecret: StoreSecretValueType;
}) => {
  const { t } = useTranslation();

  const [output, setOutput] = useState<string>('');

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm();

  useEffect(() => {
    reset({});
    setOutput('');
  }, [currentTool, reset]);

  const { runAsync: runTool, loading: isRunning } = useRequest2(
    async (data: Record<string, any>) => {
      if (!currentTool) return;
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
          {Object.keys(currentTool?.inputSchema.properties || {}).length > 0 && (
            <>
              <Box color={'myGray.900'} fontSize={'16px'} fontWeight={'medium'} mb={3}>
                {t('common:Input')}
              </Box>
              <Box border={'1px solid'} borderColor={'myGray.200'} borderRadius={'8px'} p={3}>
                {Object.entries(currentTool?.inputSchema.properties || {}).map(
                  ([paramName, paramInfo]) => (
                    <Controller
                      key={paramName}
                      control={control}
                      name={paramName}
                      rules={{
                        validate: (value) => {
                          if (!currentTool?.inputSchema.required?.includes(paramName)) return true;
                          return !!value;
                        }
                      }}
                      render={({ field: { onChange, value } }) => {
                        return (
                          <RenderToolInput
                            paramName={paramName}
                            paramInfo={paramInfo}
                            toolData={currentTool}
                            isInvalid={errors && Object.keys(errors).includes(paramName)}
                            value={value}
                            onChange={onChange}
                          />
                        );
                      }}
                    />
                  )
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
  headerSecret
}: {
  currentTool?: McpToolConfigType;
  url: string;
  headerSecret: StoreSecretValueType;
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
      showRouteToAppDetail={true}
      showRouteToDatasetDetail={true}
      isShowReadRawSource={true}
      isResponseDetail={true}
      // isShowFullText={true}
      showNodeStatus
    >
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatTest currentTool={currentTool} url={url} headerSecret={headerSecret} />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);

const RenderToolInput = ({
  paramName,
  paramInfo,
  toolData,
  value,
  onChange,
  isInvalid
}: {
  paramName: string;
  paramInfo: {
    type: string;
    description?: string;
  };
  toolData?: McpToolConfigType;
  value: any;
  onChange: (value: any) => void;
  isInvalid: boolean;
}) => {
  const render = (() => {
    if (paramInfo.type === 'string') {
      return (
        <Textarea
          value={value}
          onChange={onChange}
          placeholder={paramInfo.description}
          bg={'myGray.50'}
          isInvalid={isInvalid}
        />
      );
    }
    if (paramInfo.type === 'number') {
      return <MyNumberInput step={1} isInvalid={isInvalid} value={value} onChange={onChange} />;
    }
    if (paramInfo.type === 'boolean') {
      return <Switch isChecked={value} onChange={onChange} isInvalid={isInvalid} />;
    }

    return (
      <JsonEditor
        bg={'myGray.50'}
        placeholder={paramInfo.description}
        resize
        value={value}
        onChange={onChange}
        isInvalid={isInvalid}
      />
    );
  })();

  return (
    <Box _notLast={{ mb: 4 }}>
      <Flex alignItems="center" mb={1}>
        {toolData?.inputSchema.required?.includes(paramName) && (
          <Box mr={1} color="red.500">
            *
          </Box>
        )}
        <FormLabel fontSize="14px" fontWeight={'normal'} color="myGray.900">
          {paramName}
          <QuestionTip label={paramInfo.description} ml={1} />
        </FormLabel>
      </Flex>

      {render}
    </Box>
  );
};
