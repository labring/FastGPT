import { Box, Button, Center, Divider, Flex, Spinner } from '@chakra-ui/react';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useState } from 'react';
import { Control, Controller, FieldValues, UseFormHandleSubmit } from 'react-hook-form';
import { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { ChatBoxInputType, StartChatFnProps } from '../type';
import AIResponseBox from './AIResponseBox';
import Markdown from '@/components/Markdown';
import { ResponseBox } from './WholeResponseModal';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useTranslation } from 'react-i18next';
import { ChatTypeEnum, PluginChatBoxTypeEnum } from '../constants';
import RenderPluginInput from './renderPluginInput';
import { StreamResponseType } from '@/web/common/api/fetch';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';

const PluginBox = ({
  chatType,
  pluginInputs,
  control,
  handleSubmit,
  sendPrompt,
  chatHistories,
  isChatting,
  onStartChat
}: {
  chatType: `${ChatTypeEnum}`;
  pluginInputs: FlowNodeInputItemType[];
  control: Control<FieldValues, any>;
  handleSubmit: UseFormHandleSubmit<FieldValues>;
  sendPrompt: ({
    text,
    files,
    history,
    autoTTSResponse,
    type,
    pluginVariables
  }: ChatBoxInputType & {
    autoTTSResponse?: boolean;
    history?: ChatSiteItemType[];
    type?: 'app' | 'plugin';
    pluginVariables?: any;
  }) => void;
  chatHistories: ChatSiteItemType[];
  isChatting: boolean;
  onStartChat?: (e: StartChatFnProps) => Promise<
    StreamResponseType & {
      isNewChat?: boolean;
    }
  >;
}) => {
  const { t } = useTranslation();
  const [currentChatBoxType, setCurrentChatBoxType] = useState<PluginChatBoxTypeEnum>(() => {
    if (chatType !== ChatTypeEnum.chat) return PluginChatBoxTypeEnum.input;
    return PluginChatBoxTypeEnum.output;
  });
  const { onChangeChatId } = useContextSelector(ChatContext, (v) => v);

  const { isPc } = useSystemStore();

  return (
    <Box id="chat-container" h={'100%'} mx={'auto'}>
      {chatType !== ChatTypeEnum.chat && (
        <Flex
          w={'full'}
          bg={chatHistories.length > 0 ? 'myGray.25' : ''}
          borderBottom={chatHistories.length > 0 ? '1px solid #F4F4F7' : ''}
          h={16}
          px={4}
          position={'relative'}
        >
          {chatHistories.length > 0 ? (
            <LightRowTabs
              list={[
                { label: t('common.Input'), value: PluginChatBoxTypeEnum.input },
                { label: t('common.Output'), value: PluginChatBoxTypeEnum.output },
                { label: '完整结果', value: PluginChatBoxTypeEnum.fullResult }
              ]}
              value={currentChatBoxType}
              onChange={(e) => {
                setCurrentChatBoxType(e);
              }}
              position={'absolute'}
              bottom={0}
              inlineStyles={{ px: 0.5 }}
              gap={5}
              display={'flex'}
              alignItems={'center'}
              fontSize={['sm', 'md']}
            />
          ) : (
            <Box fontSize={'lg'} fontWeight={'bold'} mt={4} ml={2}>
              {t('core.chat.Debug test')}
            </Box>
          )}
        </Flex>
      )}
      <Flex flex={1} maxW={['100%', '92%']} mx={'auto'}>
        <Flex w={'full'} flexDirection={isPc ? 'row' : 'column'} flex={1}>
          {(currentChatBoxType === PluginChatBoxTypeEnum.input ||
            chatType === ChatTypeEnum.chat) && (
            <Box w={isPc && chatType === ChatTypeEnum.chat ? '50%' : 'full'}>
              {chatType === ChatTypeEnum.chat && (
                <Box mt={5} color={'myGray.900'} fontWeight={500}>
                  {t('common.Input')}
                </Box>
              )}
              <Box mt={4}>
                {pluginInputs?.map((input) => {
                  return (
                    <Controller
                      key={input.key}
                      control={control}
                      name={input.key}
                      render={({ field: { onChange, onBlur, value, ref } }) => (
                        <RenderPluginInput
                          value={value}
                          onChange={onChange}
                          label={input.label}
                          description={input.description}
                          disabled={chatHistories.length > 0 && chatType !== ChatTypeEnum.chatTest}
                          valueType={input.valueType}
                          placeholder={input.placeholder}
                          required={input.required}
                          min={input.min}
                          max={input.max}
                        />
                      )}
                    />
                  );
                })}
              </Box>
              {onStartChat && (
                <Flex justifyContent={'end'} mt={8}>
                  <Button
                    isLoading={isChatting}
                    onClick={handleSubmit((variables) => {
                      if (chatHistories.length > 0 && chatType === ChatTypeEnum.chat)
                        return onChangeChatId();
                      setCurrentChatBoxType(PluginChatBoxTypeEnum.output);
                      sendPrompt({
                        text: '',
                        files: [],
                        history: chatHistories,
                        autoTTSResponse: false,
                        type: 'plugin',
                        pluginVariables: variables
                      });
                    })}
                  >
                    {chatHistories.length > 0 ? t('common.Restart') : t('common.Confirm')}
                  </Button>
                </Flex>
              )}
            </Box>
          )}
          {chatType === ChatTypeEnum.chat && (
            <Divider
              orientation={isPc ? 'vertical' : 'horizontal'}
              mx={isPc ? 6 : 0}
              my={isPc ? 0 : 2}
            />
          )}
          {currentChatBoxType === PluginChatBoxTypeEnum.output && (
            <Box w={isPc && chatType === ChatTypeEnum.chat ? '50%' : 'full'}>
              {chatType === ChatTypeEnum.chat && (
                <Box mt={3}>
                  <LightRowTabs
                    list={[
                      { label: t('common.Output'), value: PluginChatBoxTypeEnum.output },
                      {
                        label: '完整结果',
                        value: PluginChatBoxTypeEnum.fullResult
                      }
                    ]}
                    value={currentChatBoxType}
                    onChange={(e) => {
                      setCurrentChatBoxType(e);
                    }}
                    inlineStyles={{ px: 0.5 }}
                    gap={5}
                    mt={3}
                    display={'flex'}
                    alignItems={'center'}
                    fontSize={['sm', 'md']}
                  />
                </Box>
              )}
              <Box border={'1px solid #E8EBF0'} mt={3} rounded={'md'} bg={'myGray.25'}>
                <Box p={4} color={'myGray.900'}>
                  <Box fontWeight={500}>流输出</Box>
                  {chatHistories.length > 0 && chatHistories[1]?.value.length > 0 ? (
                    <Box mt={2}>
                      {chatHistories[1]?.value.map((value, i) => {
                        const key = `${chatHistories[1].dataId}-ai-${i}`;
                        return (
                          <AIResponseBox
                            key={key}
                            value={value}
                            index={i}
                            chat={chatHistories[1]}
                            isLastChild={true}
                            isChatting={isChatting}
                            questionGuides={[]}
                          />
                        );
                      })}
                    </Box>
                  ) : null}
                </Box>
              </Box>
              <Box border={'1px solid #E8EBF0'} mt={4} rounded={'md'} bg={'myGray.25'}>
                <Box p={4} color={'myGray.900'} fontWeight={500}>
                  <Box>插件输出</Box>
                  {chatHistories.length > 0 && chatHistories[1].responseData ? (
                    <Markdown
                      source={`~~~json\n${JSON.stringify(chatHistories[1].responseData.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput)?.pluginOutput, null, 2)}`}
                    />
                  ) : null}
                </Box>
              </Box>
            </Box>
          )}
          {currentChatBoxType === PluginChatBoxTypeEnum.fullResult && (
            <Box w={isPc && chatType === ChatTypeEnum.chat ? '50%' : 'full'}>
              {chatType === ChatTypeEnum.chat && (
                <Box mt={3}>
                  <LightRowTabs
                    list={[
                      { label: t('common.Output'), value: PluginChatBoxTypeEnum.output },
                      {
                        label: '完整结果',
                        value: PluginChatBoxTypeEnum.fullResult
                      }
                    ]}
                    value={currentChatBoxType}
                    onChange={(e) => {
                      setCurrentChatBoxType(e);
                    }}
                    inlineStyles={{ px: 0.5 }}
                    gap={5}
                    mt={3}
                    display={'flex'}
                    alignItems={'center'}
                    fontSize={['sm', 'md']}
                  />
                </Box>
              )}
              {chatHistories.length > 0 && chatHistories[1].responseData ? (
                <ResponseBox response={chatHistories[1].responseData} showDetail={true} />
              ) : null}
            </Box>
          )}
        </Flex>
      </Flex>
    </Box>
  );
};

export default PluginBox;
