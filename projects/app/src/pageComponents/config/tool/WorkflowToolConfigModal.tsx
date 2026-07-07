import React, { useMemo, useState } from 'react';
import { useForm, type DefaultValues } from 'react-hook-form';
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  ModalBody,
  ModalFooter,
  Switch,
  Textarea,
  useDisclosure
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useTranslation } from 'next-i18next';
import type {
  CreateAppToolBodyType,
  UpdateWorkflowToolBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import {
  getAdminAllSystemAppTool,
  getAdminSystemToolDetail,
  postAdminCreateAppTypeTool,
  putAdminUpdateWorkflowTool
} from '@/web/core/plugin/admin/tool/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';

export const defaultForm: UpdateWorkflowToolBodyType = {
  id: '',
  name: '',
  avatar: 'core/app/type/pluginFill',
  intro: '',
  status: PluginStatusEnum.Normal,
  hasTokenFee: false,
  originCost: 0,
  currentCost: 0,
  userGuide: '',
  author: '',
  associatedPluginId: ''
};

const WorkflowToolConfigModal = ({
  toolId,
  onSuccess,
  onClose
}: {
  toolId: string;
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const { value: selectedTags, setValue: setSelectedTags } = useMultipleSelect<string>([], false);

  const { register, reset, setValue, watch, handleSubmit } = useForm<UpdateWorkflowToolBodyType>({
    defaultValues: defaultForm as DefaultValues<UpdateWorkflowToolBodyType>
  });
  const name = watch('name');
  const avatar = watch('avatar');
  const associatedPluginId = watch('associatedPluginId');
  const intro = watch('intro');
  const currentCost = watch('currentCost');
  const status = watch('status');
  const hasTokenFee = watch('hasTokenFee');
  const isToolOffline = status === PluginStatusEnum.Offline;
  const [toolVersion, setToolVersion] = useState('');
  const { openConfirm: openUninstallConfirm, ConfirmModal: UninstallConfirmModal } = useConfirm({
    type: 'delete'
  });

  React.useEffect(() => {
    setValue('tags', selectedTags);
  }, [selectedTags, setValue]);

  useRequest(
    async () => {
      if (toolId) {
        const res = await getAdminSystemToolDetail({ toolId });
        setToolVersion(res.version);
        const form: UpdateWorkflowToolBodyType = {
          id: res.id,
          status: res.status,
          originCost: res.originCost,
          currentCost: res.currentCost,
          systemKeyCost: res.systemKeyCost,
          hasTokenFee: res.hasTokenFee,
          name: res.name,
          avatar: res.avatar,
          intro: res.intro,
          tags: res.tags || [],
          userGuide: res.userGuide || '',
          author: res.author,
          associatedPluginId: res.associatedPluginId
        };
        setSelectedTags(res.tags || []);
        setSearchKey(res.associatedPluginId || '');
        return form;
      }
      return defaultForm;
    },
    {
      onSuccess(res) {
        reset(res);
      },
      manual: false
    }
  );

  const isEdit = !!toolId;

  const [searchKey, setSearchKey] = useState('');
  const [lastPluginId, setLastPluginId] = useState<string | undefined>('');

  const { data: apps = [], loading: loadingPlugins } = useRequest(
    () => getAdminAllSystemAppTool({ searchKey }),
    {
      manual: false,
      refreshDeps: [searchKey]
    }
  );

  const { data: tags = [], loading: loadingTags } = useRequest(getPluginToolTags, {
    manual: false
  });
  const pluginTypeSelectList = useMemo(
    () =>
      tags?.map((tag) => ({
        label: parseI18nString(tag.tagName, i18n.language),
        value: tag.tagId
      })) || [],
    [i18n.language, tags]
  );
  const pluginStatusSelectList = useMemo(
    () => [
      { label: t('app:toolkit_status_normal'), value: PluginStatusEnum.Normal },
      {
        label: t('app:toolkit_status_soon_offline'),
        value: PluginStatusEnum.SoonOffline
      }
    ],
    [t]
  );

  const currentApp = useMemo(() => {
    return apps.find((item) => item._id === associatedPluginId);
  }, [apps, associatedPluginId]);

  const {
    isOpen: isOpenAppListMenu,
    onClose: onCloseAppListMenu,
    onOpen: onOpenAppListMenu
  } = useDisclosure();

  const {
    Component: AvatarUploader,
    handleFileSelectorOpen: handleAvatarSelectorOpen,
    uploading: isUploadingAvatar
  } = useUploadAvatar(getUploadAvatarPresignedUrl, {
    onSuccess(avatarUrl) {
      setValue('avatar', avatarUrl);
    }
  });

  const { runAsync: onSubmit, loading: isSubmitting } = useRequest(
    (data: UpdateWorkflowToolBodyType) => {
      if (!isEdit && !data.associatedPluginId) {
        return Promise.reject(t('app:custom_plugin_associated_plugin_required'));
      }
      const associatedPluginId = data.associatedPluginId;

      const formatData: UpdateWorkflowToolBodyType = {
        ...data,
        id: toolId
      };

      if (formatData.id) {
        return putAdminUpdateWorkflowTool(formatData);
      }

      const createData: CreateAppToolBodyType = {
        name: data.name || '',
        avatar: data.avatar || '',
        intro: data.intro || '',
        status: data.status,
        hasTokenFee: data.hasTokenFee,
        originCost: data.originCost,
        currentCost: data.currentCost,
        systemKeyCost: data.systemKeyCost,
        secretsVal: data.secretsVal,
        tags: data.tags,
        associatedPluginId: associatedPluginId!,
        userGuide: data.userGuide,
        author: data.author,
        promoteTags: data.promoteTags,
        hideTags: data.hideTags
      };

      return postAdminCreateAppTypeTool(createData);
    },
    {
      manual: true,
      successToast: t('app:custom_plugin_config_success'),
      onSuccess: () => {
        onSuccess();
        onClose();
      },
      onError() {},
      refreshDeps: [toolId]
    }
  );

  const { runAsync: onUninstall, loading: isUninstalling } = useRequest(
    () =>
      putAdminUpdateWorkflowTool({
        id: toolId,
        status: PluginStatusEnum.Offline
      }),
    {
      successToast: t('app:custom_plugin_uninstall_success'),
      onSuccess() {
        onSuccess();
        onClose();
      }
    }
  );

  const { runAsync: onReinstall, loading: isReinstalling } = useRequest(
    () =>
      putAdminUpdateWorkflowTool({
        id: toolId,
        status: PluginStatusEnum.Normal
      }),
    {
      successToast: t('app:custom_plugin_install_success'),
      onSuccess() {
        onSuccess();
        onClose();
      }
    }
  );

  const openToolUninstallConfirm = () => {
    openUninstallConfirm({
      title: t('app:toolkit_uninstall'),
      customContent: t('app:confirm_uninstall_tool'),
      confirmText: t('app:toolkit_uninstall'),
      confirmButtonVariant: 'dangerOutline',
      inputConfirmText: name || toolId,
      onConfirm: onUninstall
    })();
  };

  const offlineVersionInfoSection = (
    <Box border={'1px solid'} borderColor={'myGray.200'} borderRadius={'8px'} p={4}>
      <Flex alignItems={'flex-start'} justifyContent={'space-between'} gap={4} mb={4}>
        <Box color={'myGray.400'} fontSize={'10px'} lineHeight={'14px'} fontWeight={'500'}>
          {t('app:toolkit_version_info')}
        </Box>
        <Flex alignItems={'center'} gap={2} minW={0}>
          <Box color={'myGray.400'} fontSize={'10px'} lineHeight={'14px'} flexShrink={0}>
            {t('app:toolkit_id')}:
          </Box>
          <Box
            color={'myGray.500'}
            fontSize={'10px'}
            lineHeight={'14px'}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
            whiteSpace={'nowrap'}
          >
            {toolId}
          </Box>
          <CopyBox value={toolId} lineHeight={0}>
            <MyIcon name={'copy'} w={'12px'} color={'myGray.400'} />
          </CopyBox>
        </Flex>
      </Flex>
      <Flex flexDirection={'column'} gap={4}>
        <Flex alignItems={'center'} gap={4} minH={9}>
          <Box flex={'0 0 160px'} color={'#24282C'} fontSize={'14px'} fontWeight={'500'}>
            {t('app:toolkit_plugin_version')}
          </Box>
          <Box flex={1} minW={0}>
            <MySelect<string>
              width={'100%'}
              h={9}
              value={toolVersion || '-'}
              list={[
                {
                  label: toolVersion || '-',
                  value: toolVersion || '-'
                }
              ]}
              isDisabled
              onChange={setToolVersion}
            />
          </Box>
        </Flex>
        <Flex alignItems={'center'} gap={4} minH={9}>
          <Box flex={'0 0 160px'} color={'#24282C'} fontSize={'14px'} fontWeight={'500'}>
            {t('app:toolkit_plugin_name')}
          </Box>
          <Box flex={1} minW={0} color={'#24282C'} fontSize={'14px'} lineHeight={'20px'}>
            {name || '-'}
          </Box>
        </Flex>
        <Flex alignItems={'flex-start'} gap={4} minH={9}>
          <Box flex={'0 0 160px'} color={'#24282C'} fontSize={'14px'} fontWeight={'500'}>
            {t('app:toolkit_plugin_intro')}
          </Box>
          <Box
            flex={1}
            minW={0}
            color={'#24282C'}
            fontSize={'14px'}
            lineHeight={'20px'}
            whiteSpace={'pre-wrap'}
          >
            {intro || '-'}
          </Box>
        </Flex>
      </Flex>
    </Box>
  );

  return (
    <MyModal
      isCentered
      isOpen
      title={t('app:custom_plugin_config_title', { name: name || t('app:custom_plugin') })}
      maxW={isToolOffline ? ['90vw', '560px'] : ['90vw', '900px']}
      w={'100%'}
      iconSrc={avatar}
      position={'relative'}
      onClose={onClose}
      isLoading={!isToolOffline && (loadingPlugins || loadingTags)}
    >
      <ModalBody flex={1} w={'full'}>
        {isToolOffline ? (
          offlineVersionInfoSection
        ) : (
          <Flex w={'full'} gap={5}>
            <Box w={'full'}>
              <Box color={'myGray.900'} fontWeight={'medium'} fontSize={'sm'}>
                {t('app:custom_plugin_name_label')}
              </Box>
              <Flex mt={2} alignItems={'center'}>
                <MyTooltip
                  label={
                    isUploadingAvatar
                      ? t('app:custom_plugin_uploading')
                      : t('app:custom_plugin_click_upload_avatar')
                  }
                >
                  <Avatar
                    flexShrink={0}
                    src={avatar}
                    w={['28px', '36px']}
                    h={['28px', '36px']}
                    cursor={isUploadingAvatar || isToolOffline ? 'not-allowed' : 'pointer'}
                    borderRadius={'md'}
                    onClick={
                      isUploadingAvatar || isToolOffline ? undefined : handleAvatarSelectorOpen
                    }
                    opacity={isUploadingAvatar || isToolOffline ? 0.6 : 1}
                  />
                </MyTooltip>
                <Input
                  flex={1}
                  ml={3}
                  autoFocus
                  bg={'myWhite.600'}
                  {...register('name', {
                    required: t('app:custom_plugin_name_required')
                  })}
                  isDisabled={isToolOffline}
                />
              </Flex>
              <Box mt={6}>
                <Box color={'myGray.900'} fontWeight={'medium'} fontSize={'sm'} mb={2}>
                  {t('app:custom_plugin_intro_label')}
                </Box>
                <Textarea
                  {...register('intro')}
                  bg={'myGray.50'}
                  placeholder={t('app:custom_plugin_intro_placeholder')}
                  isDisabled={isToolOffline}
                />
              </Box>
              <HStack mt={6}>
                <Box flex={'0 0 160px'} color={'myGray.900'} fontWeight={'medium'} fontSize={'sm'}>
                  {t('app:custom_plugin_associated_plugin_label')}
                </Box>
                <Flex flex={'1 0 0'} flexDirection={'column'}>
                  {associatedPluginId && (
                    <Avatar
                      src={currentApp?.avatar}
                      mt={2}
                      ml={4}
                      w={'20px'}
                      borderRadius={'2px'}
                      position="absolute"
                      zIndex={1}
                    />
                  )}
                  <Input
                    pl={associatedPluginId ? 10 : 4}
                    fontSize={'14px'}
                    placeholder={t('app:custom_plugin_associated_plugin_placeholder')}
                    value={currentApp?.name}
                    onChange={(e) => {
                      setSearchKey(e.target.value);
                    }}
                    onFocus={() => {
                      onOpenAppListMenu();
                      setLastPluginId(associatedPluginId);
                      setValue('associatedPluginId', undefined);
                    }}
                    onBlur={() => {
                      onCloseAppListMenu();
                      if (associatedPluginId) return;
                      setValue('associatedPluginId', lastPluginId);
                    }}
                    bg={'myGray.50'}
                    isDisabled={isToolOffline}
                  />
                  {isOpenAppListMenu && !isToolOffline && apps.length > 0 && (
                    <Flex
                      position={'absolute'}
                      mt={9}
                      w={'100%'}
                      flexDirection={'column'}
                      gap={2}
                      p={1}
                      boxShadow="lg"
                      bg="white"
                      borderRadius="md"
                      zIndex={10}
                      maxH={'200px'}
                      maxW={'260px'}
                      overflow={'auto'}
                    >
                      {apps.map((item) => (
                        <Flex
                          key={item._id}
                          p="2"
                          alignItems={'center'}
                          _hover={{ bg: 'myGray.100' }}
                          mx="1"
                          borderRadius="sm"
                          cursor={'pointer'}
                          onMouseDown={() => {
                            setSearchKey(item.name);
                            setValue('associatedPluginId', item._id);
                            onCloseAppListMenu();
                          }}
                        >
                          <Avatar src={item.avatar} w="1.25rem" rounded={'2px'} />
                          <Box ml="2" fontSize={'14px'}>
                            {item.name}
                          </Box>
                        </Flex>
                      ))}
                    </Flex>
                  )}
                </Flex>
              </HStack>
              <HStack mt={6}>
                <Box
                  flex={'0 0 160px'}
                  color={'myGray.900'}
                  fontWeight={'medium'}
                  fontSize={'sm'}
                  mb={2}
                >
                  {t('app:custom_plugin_tags_label')}
                </Box>
                <MultipleSelect
                  list={pluginTypeSelectList}
                  value={selectedTags}
                  onSelect={(newTags) => {
                    if (newTags.length > 3) {
                      toast({
                        title: t('app:custom_plugin_tags_max_limit'),
                        status: 'warning'
                      });
                      return;
                    }
                    setSelectedTags(newTags);
                  }}
                  placeholder={t('app:custom_plugin_tags_label')}
                  maxW={270}
                  h={9}
                  borderRadius={'sm'}
                  bg={'myGray.50'}
                  isDisabled={isToolOffline}
                />
              </HStack>
              <HStack mt={6}>
                <Box flex={'0 0 160px'} color={'myGray.900'} fontWeight={'medium'} fontSize={'sm'}>
                  {t('app:custom_plugin_author_label')}
                </Box>
                <Box flex={1}>
                  <Input
                    placeholder={t('app:custom_plugin_author_placeholder')}
                    h={9}
                    bg={'myGray.50'}
                    isDisabled={isToolOffline}
                    {...register('author')}
                  />
                </Box>
              </HStack>
              <HStack mt={6}>
                <Box flex={'0 0 160px'} color={'myGray.900'} fontWeight={'medium'} fontSize={'sm'}>
                  {t('app:custom_plugin_plugin_status_label')}
                </Box>
                <Box flex={'1 0 0'}>
                  <MySelect<PluginStatusType>
                    value={status}
                    w={'full'}
                    bg={'myGray.50'}
                    list={pluginStatusSelectList}
                    isDisabled={isToolOffline}
                    onChange={(e) => setValue('status', e)}
                    fontWeight={'normal'}
                  />
                </Box>
              </HStack>
              <HStack mt={6}>
                <Flex
                  flex={'0 0 160px'}
                  color={'myGray.900'}
                  fontWeight={'medium'}
                  fontSize={'sm'}
                  alignItems={'center'}
                >
                  <Box as={'span'} lineHeight={'20px'}>
                    {t('app:custom_plugin_call_price_label')}
                  </Box>
                  <QuestionTip
                    ml={1}
                    flexShrink={0}
                    label={t('app:custom_plugin_call_price_tip')}
                  />
                </Flex>
                <Box flex={'1 0 0'}>
                  <MyNumberInput
                    value={currentCost ?? 0}
                    onChange={(e) => setValue('currentCost', e ?? 0)}
                    max={1000}
                    min={0}
                    step={0.1}
                    w={'full'}
                    h={9}
                    isDisabled={isToolOffline}
                  />
                </Box>
              </HStack>
              <HStack mt={6}>
                <Flex
                  flex={'0 0 160px'}
                  color={'myGray.900'}
                  fontWeight={'medium'}
                  fontSize={'sm'}
                  alignItems={'center'}
                >
                  <Box as={'span'} lineHeight={'20px'}>
                    {t('app:custom_plugin_has_token_fee_label')}
                  </Box>
                  <QuestionTip ml={1} flexShrink={0} label={t('app:toolkit_token_fee_tip')} />
                </Flex>
                <Box flex={'1 0 0'}>
                  <Switch
                    isChecked={!!hasTokenFee}
                    isDisabled={isToolOffline}
                    onChange={(e) => setValue('hasTokenFee', e.target.checked)}
                  />
                </Box>
              </HStack>
            </Box>
            <Box w={'full'}>
              <Box mb={'9px'} color={'myGray.900'} fontWeight={'medium'} fontSize={'sm'}>
                {t('app:custom_plugin_user_guide_label')}
              </Box>
              <Textarea
                {...register('userGuide')}
                placeholder={t('app:custom_plugin_user_guide_placeholder')}
                bg={'myGray.50'}
                minH={'562px'}
                maxH={'562px'}
                isDisabled={isToolOffline}
              />
            </Box>
          </Flex>
        )}
      </ModalBody>
      <ModalFooter justifyContent={'space-between'}>
        {isToolOffline ? (
          <>
            <Box color={'myGray.500'} fontSize={'14px'} lineHeight={'20px'}>
              {t('app:toolkit_uninstalled_reinstall_tip')}
            </Box>
            <Flex gap={3}>
              <Button variant={'whiteBase'} h={'32px'} w={'64px'} onClick={onClose}>
                {t('common:Cancel')}
              </Button>
              <Button h={'32px'} w={'64px'} isLoading={isReinstalling} onClick={onReinstall}>
                {t('app:toolkit_install')}
              </Button>
            </Flex>
          </>
        ) : (
          <>
            {toolId ? (
              <Button
                variant={'dangerOutline'}
                isLoading={isUninstalling}
                onClick={openToolUninstallConfirm}
              >
                {t('app:toolkit_uninstall')}
              </Button>
            ) : (
              <Box />
            )}

            <Flex gap={4}>
              <Button variant={'whiteBase'} onClick={onClose}>
                {t('common:Close')}
              </Button>
              <Button
                isLoading={isSubmitting || isUploadingAvatar}
                onClick={handleSubmit(onSubmit)}
              >
                {isEdit ? t('app:custom_plugin_update') : t('app:custom_plugin_create')}
              </Button>
            </Flex>
          </>
        )}
      </ModalFooter>
      <UninstallConfirmModal isLoading={isUninstalling} />
      <AvatarUploader />
    </MyModal>
  );
};

export default WorkflowToolConfigModal;
