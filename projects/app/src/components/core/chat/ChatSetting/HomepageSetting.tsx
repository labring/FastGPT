import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import MyInput from '@/components/MyInput';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { updateChatSetting } from '@/web/core/chat/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import ImageUpload from '@/components/core/chat/ChatSetting/ImageUpload';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/setting/type';
import type { UploadedFileItem } from '@/components/core/chat/ChatSetting/ImageUpload/hooks/useImageUpload';
import { useToast } from '@fastgpt/web/hooks/useToast';
import NextHead from '@/components/common/NextHead';
import ProModal from '@/components/ProTip/ProModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ToolSelectModal from '@/components/core/chat/ChatSetting/ToolSelectModal';
import type {
  FlowNodeTemplateType,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node.d';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useChatSettingContext } from '@/web/core/chat/context/chatSettingContext';

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
  onDiagramShow: (show: boolean) => void;
};

type FormValues = {
  slogan: string;
  dialogTips: string;
  homeTabTitle: string;
  selectedTools: ChatSettingSchema['selectedTools'];
  wideLogoUploaded: UploadedFileItem[];
  squareLogoUploaded: UploadedFileItem[];
};

const HomepageSetting = ({ Header, onDiagramShow }: Props) => {
  //------------ hooks ------------//
  const { toast } = useToast();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const { logos, chatSettings, refreshChatSetting } = useChatSettingContext();

  const defaultValues = useMemo<FormValues>(
    () => ({
      slogan: chatSettings?.slogan || t('chat:setting.home.slogan.default'),
      dialogTips: chatSettings?.dialogTips || t('chat:setting.home.dialogue_tips.default'),
      homeTabTitle: chatSettings?.homeTabTitle || 'FastGPT',
      selectedTools: chatSettings?.selectedTools || [],
      wideLogoUploaded: [],
      squareLogoUploaded: []
    }),
    [chatSettings, t]
  );

  const { register, control, handleSubmit, reset, setValue, watch, formState } =
    useForm<FormValues>({
      defaultValues
    });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

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
        setValue('selectedTools', next, { shouldDirty: true });
      }
    },
    [selectedTools, setValue]
  );

  const handleRemoveTool = useCallback(
    (tool: NodeTemplateListItemType) => {
      const next = selectedTools.filter((t) => t.pluginId !== tool.id);
      setValue('selectedTools', next, { shouldDirty: true });
    },
    [selectedTools, setValue]
  );

  const handleRemoveToolById = useCallback(
    (toolId: string | undefined) => {
      if (!toolId) return;
      const next = selectedTools.filter((t) => t.pluginId !== toolId);
      setValue('selectedTools', next, { shouldDirty: true });
    },
    [selectedTools, setValue]
  );

  const { runAsync: onSubmit, loading: isSaving } = useRequest2(async (values: FormValues) => {
    try {
      await updateChatSetting({
        ...values,
        selectedTools: values.selectedTools.map((tool) => ({
          pluginId: tool.pluginId,
          inputs: tool.inputs
        }))
      });
      const refreshed = await refreshChatSetting();

      const nextDefaults: FormValues = {
        slogan: refreshed?.slogan || values.slogan,
        dialogTips: refreshed?.dialogTips || values.dialogTips,
        homeTabTitle: refreshed?.homeTabTitle || values.homeTabTitle,
        selectedTools: refreshed?.selectedTools || values.selectedTools,
        wideLogoUploaded: [],
        squareLogoUploaded: []
      };
      reset(nextDefaults);

      toast({ status: 'success', title: t('chat:setting.save_success') });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  });

  return (
    <Flex flexDir="column" px={6} py={5} gap={'52px'} h="full">
      <NextHead title={chatSettings?.homeTabTitle || 'FastGPT'} icon="/icon/logo.svg" />

      <Header>
        <Button
          variant={'outline'}
          borderColor={'primary.300'}
          _hover={{ bg: 'primary.50' }}
          color={'primary.700'}
          isLoading={isSaving}
          isDisabled={!formState.isDirty}
          leftIcon={<MyIcon name={'save'} w="14px" h="14px" color="primary.700" />}
          onClick={handleSubmit(onSubmit)}
        >
          {t('chat:setting.save')}
        </Button>
      </Header>

      <Flex
        w="100%"
        flexGrow="1"
        overflowY="auto"
        flexDir="column"
        alignSelf="center"
        alignItems="center"
        justifyContent="flex-start"
      >
        <Flex w="630px">
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
                <Grid templateColumns="repeat(3, 1fr)" gap={2}>
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
                        <Avatar src={tool.avatar} w={4} rounded="4px" />
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
                  onRemoveTool={handleRemoveTool}
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
                <MyInput
                  isDisabled={isSaving}
                  placeholder={t('chat:setting.home.slogan_placeholder')}
                  {...register('slogan')}
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
                <MyInput
                  isDisabled={isSaving}
                  placeholder={t('chat:setting.home.dialogue_tips_placeholder')}
                  {...register('dialogTips')}
                />
              </Box>
            </Box>

            {/* COPYRIGHT */}
            {feConfigs.hideChatCopyrightSetting && (
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

                  <Flex alignItems="center">
                    <Controller
                      name="wideLogoUploaded"
                      control={control}
                      render={({ field }) => (
                        <ImageUpload
                          height="100px"
                          aspectRatio={2.84 / 1}
                          uploadedFiles={field.value}
                          tips={t('chat:setting.copyright.tips')}
                          imageSrc={logos.wideLogoUrl}
                          defaultImageSrc={'/imgs/fastgpt_banner.png'}
                          onFileSelect={(files) => field.onChange(files)}
                        />
                      )}
                    />

                    <Box mx={8} w="1px" h="100px" alignSelf="flex-start" bg="myGray.200" />

                    <Controller
                      name="squareLogoUploaded"
                      control={control}
                      render={({ field }) => (
                        <ImageUpload
                          height="100px"
                          aspectRatio={1 / 1}
                          tips={t('chat:setting.copyright.tips.square')}
                          uploadedFiles={field.value}
                          imageSrc={logos.squareLogoUrl}
                          defaultImageSrc={'/imgs/fastgpt_banner_fold.svg'}
                          onFileSelect={(files) => field.onChange(files)}
                        />
                      )}
                    />
                  </Flex>
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
