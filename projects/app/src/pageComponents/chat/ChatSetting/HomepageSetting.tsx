import { Box, Button, Flex, Grid, Input } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import MyInput from '@/components/MyInput';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { updateChatSetting } from '@/web/core/chat/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import ImageUpload from '@/pageComponents/chat/ChatSetting/ImageUpload';
import type {
  ChatSettingSchema,
  ChatSettingUpdateParams
} from '@fastgpt/global/core/chat/setting/type';
import NextHead from '@/components/common/NextHead';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ToolSelectModal from '@/pageComponents/chat/ChatSetting/ToolSelectModal';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node.d';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useMount } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import {
  DEFAULT_LOGO_BANNER_COLLAPSED_URL,
  DEFAULT_LOGO_BANNER_URL
} from '@/pageComponents/chat/constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
  onDiagramShow: (show: boolean) => void;
};

type FormValues = Omit<ChatSettingUpdateParams, 'selectedTools'> & {
  selectedTools: ChatSettingSchema['selectedTools'];
};

const HomepageSetting = ({ Header, onDiagramShow }: Props) => {
  const { isPc } = useSystem();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const chatSettings = useContextSelector(ChatSettingContext, (v) => v.chatSettings);
  const refreshChatSetting = useContextSelector(ChatSettingContext, (v) => v.refreshChatSetting);

  const chatSettings2Form = useCallback(
    (data?: ChatSettingSchema) => {
      return {
        slogan: data?.slogan || t('chat:setting.home.slogan.default'),
        dialogTips: data?.dialogTips || t('chat:setting.home.dialogue_tips.default'),
        homeTabTitle: data?.homeTabTitle || 'FastGPT',
        selectedTools: data?.selectedTools || [],
        wideLogoUrl: data?.wideLogoUrl,
        squareLogoUrl: data?.squareLogoUrl
      };
    },
    [t]
  );

  const { register, handleSubmit, reset, setValue, watch } = useForm<FormValues>({
    defaultValues: chatSettings2Form(chatSettings)
  });

  const wideLogoUrl = watch('wideLogoUrl');
  const squareLogoUrl = watch('squareLogoUrl');

  useMount(async () => {
    reset(chatSettings2Form(await refreshChatSetting()));
  });

  const [toolSelectModalOpen, setToolSelectModalOpen] = useState(false);
  const selectedTools = watch('selectedTools');

  const handleAddTool = useCallback(
    async (tool: FlowNodeTemplateType) => {
      if (!selectedTools.some((t) => t.pluginId === tool.pluginId)) {
        const next = [
          ...selectedTools,
          {
            name: tool.name,
            pluginId: tool.pluginId || '',
            avatar: tool.avatar || '',
            inputs: tool.inputs?.reduce(
              (acc, input) => {
                acc[input.key] = input.value;
                return acc;
              },
              {} as Record<`${NodeInputKeyEnum}` | string, any>
            )
          }
        ];
        setValue('selectedTools', next);
      }
    },
    [selectedTools, setValue]
  );
  const handleRemoveToolById = useCallback(
    (toolId?: string) => {
      if (!toolId) return;
      const next = selectedTools.filter((t) => t.pluginId !== toolId);
      setValue('selectedTools', next);
    },
    [selectedTools, setValue]
  );

  const { runAsync: onSubmit, loading: isSaving } = useRequest2(
    async (values: FormValues) => {
      return updateChatSetting({
        ...values,
        selectedTools: values.selectedTools.map((tool) => ({
          pluginId: tool.pluginId,
          inputs: tool.inputs
        }))
      });
    },
    {
      onSuccess() {
        refreshChatSetting();
      },
      successToast: t('chat:setting.save_success')
    }
  );

  return (
    <Flex
      py={5}
      pl={6}
      pr={[0, 6]}
      gap={['26px', '52px']}
      flexDir="column"
      mt={['46px', 0]}
      h={['calc(100vh - 46px)', 'full']}
    >
      <Header>
        <Button
          mr={[6, 0]}
          variant={'outline'}
          borderColor={'primary.300'}
          _hover={{ bg: 'primary.50' }}
          color={'primary.700'}
          isLoading={isSaving}
          leftIcon={<MyIcon name={'save'} w="14px" h="14px" color="primary.700" />}
          onClick={handleSubmit(onSubmit)}
        >
          {t('chat:setting.save')}
        </Button>
      </Header>

      <Flex
        pr={[6, 0]}
        w="100%"
        flexGrow="1"
        overflowY="auto"
        flexDir="column"
        alignSelf="center"
        alignItems="center"
        justifyContent="flex-start"
      >
        <Flex w={['100%', '630px']}>
          <Flex flexDir="column" gap={6} w="100%">
            {/* AVAILABLE TOOLS */}
            <Box fontWeight={'500'}>
              <Flex
                fontWeight={'500'}
                fontSize="14px"
                mb={2}
                justifyContent={'space-between'}
                alignItems={'center'}
                gap={2}
              >
                <Box>{t('chat:setting.home.available_tools')}</Box>

                {selectedTools.length > 0 && (
                  <Button
                    color="myGray.600"
                    leftIcon={<MyIcon w="12px" h="12px" fill="currentColor" name={'common/add2'} />}
                    _hover={{ bg: 'primary.50' }}
                    variant={'outline'}
                    size={'sm'}
                    fontWeight={'400'}
                    onClick={() => setToolSelectModalOpen(true)}
                  >
                    {t('chat:setting.home.available_tools.add')}
                  </Button>
                )}
              </Flex>

              {selectedTools.length === 0 && (
                <Flex
                  alignItems={'center'}
                  gap={2}
                  justifyContent={'center'}
                  py={8}
                  border="1px dashed"
                  borderColor="myGray.200"
                  borderRadius="8px"
                  cursor="pointer"
                  color="myGray.400"
                  _hover={{ borderColor: 'primary.200', bg: 'primary.50', color: 'primary.500' }}
                  onClick={() => setToolSelectModalOpen(true)}
                >
                  <MyIcon w="13px" h="13px" name={'common/add2'} />
                  <Box fontSize="14px">{t('chat:setting.home.available_tools.add')}</Box>
                </Flex>
              )}

              {selectedTools.length > 0 && (
                <Grid templateColumns={['repeat(1, 1fr)', 'repeat(3, 1fr)']} gap={2}>
                  {selectedTools.map((tool) => (
                    <Flex
                      key={tool.pluginId}
                      alignItems="center"
                      justifyContent="space-between"
                      p={2}
                      border="1px solid"
                      borderColor="myGray.200"
                      borderRadius="6px"
                      bg="white"
                      boxShadow="sm"
                      _hover={{ '.chakra-icon': { display: 'block' } }}
                    >
                      <Flex alignItems="center" gap={2} flex={1}>
                        <Avatar src={tool.avatar} w={4} borderRadius="xs" />
                        <Box fontSize="xs">{tool.name}</Box>
                      </Flex>
                      <MyIcon
                        name="common/trash"
                        w="14px"
                        h="14px"
                        cursor="pointer"
                        color="myGray.500"
                        display="none"
                        _hover={{ color: 'red.500' }}
                        onClick={() => handleRemoveToolById(tool.pluginId)}
                      />
                    </Flex>
                  ))}
                </Grid>
              )}

              {toolSelectModalOpen && (
                <ToolSelectModal
                  selectedTools={selectedTools}
                  onAddTool={handleAddTool}
                  onRemoveTool={(tool) => handleRemoveToolById(tool.id)}
                  onClose={() => setToolSelectModalOpen(false)}
                />
              )}
            </Box>

            {/* SLOGAN */}
            <Box fontWeight={'500'}>
              <Flex fontWeight={'500'} fontSize="14px" mb={2} alignItems={'center'} gap={2}>
                <Box>{t('chat:setting.home.slogan')}</Box>

                <Button
                  variant={'link'}
                  size={'sm'}
                  color={'primary.600'}
                  _hover={{ textDecoration: 'none', color: 'primary.400' }}
                  _active={{ color: 'primary.600' }}
                  onClick={() => onDiagramShow(true)}
                >
                  {t('chat:setting.home.diagram')}
                </Button>
              </Flex>

              <Box>
                <Input
                  placeholder={t('chat:setting.home.slogan_placeholder')}
                  {...register('slogan', { required: true })}
                />
              </Box>
            </Box>

            {/* DIALOGUE TIPS */}
            <Box fontWeight={'500'}>
              <Flex fontWeight={'500'} fontSize="14px" mb={2} alignItems={'center'} gap={2}>
                <Box>{t('chat:setting.home.dialogue_tips')}</Box>

                <Button
                  variant={'link'}
                  size={'sm'}
                  color={'primary.600'}
                  _hover={{ textDecoration: 'none', color: 'primary.400' }}
                  _active={{ color: 'primary.600' }}
                  onClick={() => onDiagramShow(true)}
                >
                  {t('chat:setting.home.diagram')}
                </Button>
              </Flex>

              <Box>
                <Input
                  placeholder={t('chat:setting.home.dialogue_tips_placeholder')}
                  {...register('dialogTips', { required: true })}
                />
              </Box>
            </Box>

            {/* COPYRIGHT */}
            {!feConfigs.hideChatCopyrightSetting && (
              <>
                <Flex fontWeight={'500'} alignItems="center" gap={2}>
                  <Flex
                    fontWeight={'500'}
                    alignItems={'center'}
                    gap={3}
                    _before={{
                      content: '""',
                      display: 'block',
                      h: '14px',
                      w: '4px',
                      bg: 'primary.600',
                      borderRadius: '8px'
                    }}
                  >
                    {t('chat:setting.copyright.copyright_configuration')}
                  </Flex>
                </Flex>

                <Box fontWeight={'500'}>
                  <Flex fontWeight={'500'} fontSize="14px" mb={2} alignItems={'center'} gap={2}>
                    <Box>{t('chat:setting.home.home_tab_title')}</Box>

                    <Button
                      variant={'link'}
                      size={'sm'}
                      color={'primary.600'}
                      _hover={{ textDecoration: 'none', color: 'primary.400' }}
                      _active={{ color: 'primary.600' }}
                      onClick={() => onDiagramShow(true)}
                    >
                      {t('chat:setting.home.diagram')}
                    </Button>
                  </Flex>

                  <Box>
                    <MyInput
                      isDisabled={isSaving}
                      placeholder={t('chat:setting.home.home_tab_title_placeholder')}
                      {...register('homeTabTitle')}
                    />
                  </Box>
                </Box>

                {/* LOGO */}
                <Box fontWeight={'500'}>
                  <Flex fontWeight={'500'} fontSize="14px" alignItems={'center'} gap={2} mb={2}>
                    <Box>{t('chat:setting.copyright.logo')}</Box>

                    <Button
                      variant={'link'}
                      size={'sm'}
                      color={'primary.600'}
                      _hover={{ textDecoration: 'none', color: 'primary.400' }}
                      _active={{ color: 'primary.600' }}
                      onClick={() => onDiagramShow(true)}
                    >
                      {t('chat:setting.copyright.diagram')}
                    </Button>
                  </Flex>

                  <Grid
                    alignItems="center"
                    templateColumns={['1fr', 'fit-content(100px) 64px fit-content(100px)']}
                    gap={[6, 2]}
                  >
                    <ImageUpload
                      height="100px"
                      aspectRatio={2.84 / 1}
                      tips={t('chat:setting.copyright.tips')}
                      imageSrc={wideLogoUrl || DEFAULT_LOGO_BANNER_URL}
                      onFileSelect={(url) => setValue('wideLogoUrl', url)}
                    />

                    {isPc && (
                      <Box ml={8} w="1px" h="100px" alignSelf="flex-start" bg="myGray.200" />
                    )}

                    <ImageUpload
                      height="100px"
                      aspectRatio={1 / 1}
                      tips={t('chat:setting.copyright.tips.square')}
                      imageSrc={squareLogoUrl || DEFAULT_LOGO_BANNER_COLLAPSED_URL}
                      onFileSelect={(url) => setValue('squareLogoUrl', url)}
                    />
                  </Grid>
                </Box>
              </>
            )}
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default HomepageSetting;
