import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import MyInput from '@/components/MyInput';
import { useCallback, useState } from 'react';
import SettingTabs from '@/components/core/chat/ChatSetting/SettingTabs';
import type { ChatSettingTabOptionEnum } from '@/global/core/chat/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { updateChatSetting } from '@/web/core/chat/api';
import ImageUpload from '@/components/core/chat/ChatSetting/ImageUpload';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/type';
import type { UploadedFileItem } from '@/components/core/chat/ChatSetting/ImageUpload/hooks/useImageUpload';
import { makePayload } from '@/components/core/chat/ChatSetting/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import NextHead from '@/components/common/NextHead';
import ProModal from '@/components/ProTip/ProModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ToolSelectModal from '@/components/core/chat/ChatSetting/ToolSelectModal';
import type {
  FlowNodeTemplateType,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node.d';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

type Props = {
  slogan?: string;
  dialogTips?: string;
  homeTabTitle?: string;
  selectedTools?: ChatSettingSchema['selectedTools'];
  chatConfig?: AppSimpleEditFormType['chatConfig'];
  settingTabOption: `${ChatSettingTabOptionEnum}`;
  logos: Pick<ChatSettingSchema, 'wideLogoUrl' | 'squareLogoUrl'>;
  onDiagramShow: (show: boolean) => void;
  onTabChange: (tab: `${ChatSettingTabOptionEnum}`) => void;
  onSettingsRefresh: () => Promise<ChatSettingSchema | null>;
};

const HomepageSetting = ({
  logos,
  slogan: _slogan,
  settingTabOption,
  dialogTips: _dialogTips,
  homeTabTitle: _homeTabTitle,
  selectedTools: _selectedTools,
  chatConfig: _chatConfig,
  onDiagramShow,
  onTabChange,
  onSettingsRefresh
}: Props) => {
  //------------ hooks ------------//
  const { toast } = useToast();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  //------------ states ------------//
  const [isSaving, setIsSaving] = useState(false);
  const [slogan, setSlogan] = useState(_slogan || t('chat:setting.home.slogan.default'));
  const [openProModal, setOpenProModal] = useState(false);
  const [dialogTips, setDialogTips] = useState(
    _dialogTips || t('chat:setting.home.dialogue_tips.default')
  );
  const [homeTabTitle, setHomeTabTitle] = useState(_homeTabTitle || 'FastGPT');
  const [toolSelectModalOpen, setToolSelectModalOpen] = useState(false);
  const [selectedTools, setSelectedTools] = useState<ChatSettingSchema['selectedTools']>(
    _selectedTools || []
  );
  const [chatConfig, setChatConfig] = useState<AppSimpleEditFormType['chatConfig']>(
    _chatConfig || {}
  );
  const [wideLogoUploaded, setWideLogoUploaded] = useState<UploadedFileItem[]>([]);
  const [squareLogoUploaded, setSquareLogoUploaded] = useState<UploadedFileItem[]>([]);

  //------------ derived states ------------//
  const hasChanged =
    slogan !== _slogan ||
    dialogTips !== _dialogTips ||
    homeTabTitle !== _homeTabTitle ||
    wideLogoUploaded.length > 0 ||
    squareLogoUploaded.length > 0 ||
    selectedTools.length !== (_selectedTools || []).length ||
    selectedTools.some((tool, index) => tool.pluginId !== (_selectedTools || [])[index]?.pluginId);

  //------------ tool handlers ------------//
  const handleAddTool = useCallback(
    (tool: FlowNodeTemplateType) => {
      if (!selectedTools.some((t) => t.pluginId === tool.pluginId)) {
        setSelectedTools((prev) => [
          ...prev,
          {
            id: tool.id,
            pluginId: tool.pluginId,
            name: tool.name,
            avatar: tool.avatar,
            inputs: tool.inputs.reduce(
              (acc, input) => {
                acc[input.key] = input.value;
                return acc;
              },
              {} as Record<`${NodeInputKeyEnum}` | string, any>
            )
          }
        ]);
      }
    },
    [selectedTools]
  );

  const handleRemoveTool = useCallback((tool: NodeTemplateListItemType) => {
    setSelectedTools((prev) => prev.filter((t) => t.pluginId !== tool.id));
  }, []);

  const handleRemoveToolById = useCallback((toolId: string | undefined) => {
    if (!toolId) return;
    setSelectedTools((prev) => prev.filter((t) => t.pluginId !== toolId));
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const payload = makePayload(
        ['slogan', slogan],
        ['dialogTips', dialogTips],
        ['homeTabTitle', homeTabTitle],
        ['selectedTools', selectedTools],
        ['chatConfig', chatConfig],
        ['wideLogoUrl', wideLogoUploaded.length > 0 ? wideLogoUploaded[0].url : undefined],
        ['squareLogoUrl', squareLogoUploaded.length > 0 ? squareLogoUploaded[0].url : undefined]
      );
      await updateChatSetting(payload);
      await onSettingsRefresh();
      setWideLogoUploaded([]);
      setSquareLogoUploaded([]);
      toast({ status: 'success', title: t('chat:setting.save_success') });
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  }, [
    slogan,
    dialogTips,
    homeTabTitle,
    selectedTools,
    chatConfig,
    wideLogoUploaded,
    squareLogoUploaded,
    onSettingsRefresh,
    toast,
    t
  ]);

  return (
    <Flex flexDir="column" px={6} py={5} gap={'52px'} h="full">
      <NextHead title={_homeTabTitle || 'FastGPT'} icon="/icon/logo.svg" />

      <Flex flexShrink={0} justifyContent={'space-between'} gap={4} alignItems={'center'}>
        <SettingTabs settingTabOption={settingTabOption} onTabChange={onTabChange} />

        <Button
          variant={'outline'}
          borderColor={'primary.300'}
          _hover={{ bg: 'primary.50' }}
          color={'primary.700'}
          isLoading={isSaving}
          isDisabled={!hasChanged}
          leftIcon={<MyIcon name={'core/chat/setting/save'} />}
          onClick={handleSave}
        >
          {t('chat:setting.save')}
        </Button>
      </Flex>

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
                    leftIcon={<MyIcon w="12px" h="12px" name={'common/add2'} />}
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
                    >
                      <Flex alignItems="center" gap={2} flex={1}>
                        <Avatar src={tool.avatar} w={4} />
                        <Box fontSize="xs">{tool.name}</Box>
                      </Flex>
                      <MyIcon
                        name="common/trash"
                        w="14px"
                        h="14px"
                        cursor="pointer"
                        color="myGray.500"
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
                  chatConfig={chatConfig}
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
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  placeholder={t('chat:setting.home.slogan_placeholder')}
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
                  value={dialogTips}
                  onChange={(e) => setDialogTips(e.target.value)}
                  placeholder={t('chat:setting.home.dialogue_tips_placeholder')}
                />
              </Box>
            </Box>

            {/* COPYRIGHT */}
            {feConfigs.isCommercial && (
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

                  {!feConfigs.isCommercial && (
                    <Box
                      px={1}
                      py={0.5}
                      fontSize="10px"
                      cursor="pointer"
                      userSelect="none"
                      color="myGray.800"
                      borderRadius="8px 8px 8px 2px"
                      background="linear-gradient(7deg, #BDE7F8 28.98%, #ECC3FF 95.94%)"
                      onClick={() => setOpenProModal(true)}
                    >
                      {t('chat:setting.home.commercial_version')}
                    </Box>
                  )}
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
                      value={homeTabTitle}
                      placeholder={t('chat:setting.home.home_tab_title_placeholder')}
                      onChange={(e) => setHomeTabTitle(e.target.value)}
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
                    <ImageUpload
                      height="100px"
                      aspectRatio={2.84 / 1}
                      uploadedFiles={wideLogoUploaded}
                      tips={t('chat:setting.copyright.tips')}
                      imageSrc={logos.wideLogoUrl}
                      defaultImageSrc={'/imgs/fastgpt_slogan.png'}
                      onFileSelect={setWideLogoUploaded}
                    />

                    <Box mx={8} w="1px" h="100px" alignSelf="flex-start" bg="myGray.200" />

                    <ImageUpload
                      height="100px"
                      aspectRatio={1 / 1}
                      tips={t('chat:setting.copyright.tips.square')}
                      uploadedFiles={squareLogoUploaded}
                      imageSrc={logos.squareLogoUrl}
                      defaultImageSrc={'/imgs/fastgpt_slogan_fold.svg'}
                      onFileSelect={setSquareLogoUploaded}
                    />
                  </Flex>
                </Box>

                <ProModal isOpen={openProModal} onClose={() => setOpenProModal(false)} />
              </>
            )}
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default HomepageSetting;
