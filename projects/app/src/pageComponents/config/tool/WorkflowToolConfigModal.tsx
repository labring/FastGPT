import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useTranslation } from 'next-i18next';
import type { UpdateToolBodyType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import {
  delAdminSystemTool,
  getAdminAllSystemAppTool,
  getAdminSystemToolDetail,
  postAdminCreateAppTypeTool,
  putAdminUpdateTool
} from '@/web/core/plugin/admin/tool/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';

export const defaultForm: UpdateToolBodyType = {
  pluginId: '',
  defaultInstalled: false,
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

  const { register, reset, setValue, watch, handleSubmit } = useForm<UpdateToolBodyType>({
    defaultValues: defaultForm
  });
  const name = watch('name');
  const avatar = watch('avatar');
  const associatedPluginId = watch('associatedPluginId');
  const currentCost = watch('currentCost');
  const status = watch('status');
  const defaultInstalled = watch('defaultInstalled');

  React.useEffect(() => {
    setValue('tagIds', selectedTags);
  }, [selectedTags, setValue]);

  useRequest2(
    async () => {
      if (toolId) {
        const res = await getAdminSystemToolDetail({ toolId });
        const form: UpdateToolBodyType = {
          pluginId: res.id,
          status: res.status,
          defaultInstalled: res.defaultInstalled,
          originCost: res.originCost,
          currentCost: res.currentCost,
          systemKeyCost: res.systemKeyCost,
          hasTokenFee: res.hasTokenFee,
          inputListVal: res.inputListVal,
          name: res.name,
          avatar: res.avatar,
          intro: res.intro,
          tagIds: res.tags || [],
          associatedPluginId: res.associatedPluginId,
          userGuide: res.userGuide || '',
          author: res.author
        };
        setSelectedTags(res.tags || []);
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

  const { data: apps = [], loading: loadingPlugins } = useRequest2(
    () => getAdminAllSystemAppTool({ searchKey }),
    {
      manual: false,
      refreshDeps: [searchKey]
    }
  );

  const { data: tags = [], loading: loadingTags } = useRequest2(getPluginToolTags, {
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

  const { runAsync: onSubmit, loading: isSubmitting } = useRequest2(
    (data: UpdateToolBodyType) => {
      if (!data.associatedPluginId) {
        return Promise.reject(t('app:custom_plugin_associated_plugin_required'));
      }

      const formatData: UpdateToolBodyType = {
        ...data,
        pluginId: toolId
      };

      if (formatData.pluginId) {
        return putAdminUpdateTool(formatData);
      }

      return postAdminCreateAppTypeTool(formatData);
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

  const { runAsync: onDelete, loading: isDeleting } = useRequest2(delAdminSystemTool, {
    onSuccess() {
      toast({
        title: t('app:custom_plugin_delete_success'),
        status: 'success'
      });
      onSuccess();
      onClose();
    }
  });

  return (
    <MyModal
      isCentered
      isOpen
      title={t('app:custom_plugin_config_title', { name: name || t('app:custom_plugin') })}
      maxW={['90vw', '900px']}
      w={'100%'}
      iconSrc={avatar}
      position={'relative'}
      onClose={onClose}
      isLoading={loadingPlugins || loadingTags}
    >
      <ModalBody flex={1} w={'full'}>
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
                  cursor={isUploadingAvatar ? 'not-allowed' : 'pointer'}
                  borderRadius={'md'}
                  onClick={isUploadingAvatar ? undefined : handleAvatarSelectorOpen}
                  opacity={isUploadingAvatar ? 0.6 : 1}
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
                />
                {isOpenAppListMenu && apps.length > 0 && (
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
                  {...register('author')}
                />
              </Box>
            </HStack>
            <HStack mt={6}>
              <Box flex={'0 0 160px'} color={'myGray.900'} fontWeight={'medium'} fontSize={'sm'}>
                {t('app:custom_plugin_plugin_status_label')}
              </Box>
              <Box flex={'1 0 0'}>
                <MySelect<PluginStatusEnum>
                  value={status}
                  w={'full'}
                  bg={'myGray.50'}
                  list={[
                    { label: t('app:toolkit_status_normal'), value: PluginStatusEnum.Normal },
                    {
                      label: t('app:toolkit_status_soon_offline'),
                      value: PluginStatusEnum.SoonOffline
                    },
                    { label: t('app:toolkit_status_offline'), value: PluginStatusEnum.Offline }
                  ]}
                  onChange={(e) => {
                    setValue('status', e);
                    if (e !== PluginStatusEnum.Normal) {
                      setValue('defaultInstalled', false);
                    }
                  }}
                  fontWeight={'normal'}
                />
              </Box>
            </HStack>
            <HStack mt={6}>
              <Box flex={1} color={'myGray.900'} fontWeight={'medium'} fontSize={'sm'}>
                {t('app:custom_plugin_default_installed_label')}
              </Box>
              <Switch
                isChecked={defaultInstalled}
                onChange={(e) => {
                  const newDefaultInstalled = e.target.checked;
                  setValue('defaultInstalled', newDefaultInstalled);
                  if (newDefaultInstalled && status !== PluginStatusEnum.Normal) {
                    setValue('status', PluginStatusEnum.Normal);
                  }
                }}
              />
            </HStack>
            <HStack mt={6}>
              <Box flex={1} color={'myGray.900'} fontWeight={'medium'} fontSize={'sm'}>
                {t('app:custom_plugin_has_token_fee_label')}
              </Box>
              <Switch {...register('hasTokenFee')} />
            </HStack>
            <HStack mt={6}>
              <Box flex={'0 0 160px'} color={'myGray.900'} fontWeight={'medium'} fontSize={'sm'}>
                {t('app:custom_plugin_call_price_label')}
              </Box>
              <Box flex={'1 0 0'}>
                <MyNumberInput
                  value={currentCost ?? 0}
                  onChange={(e) => setValue('currentCost', e ?? 0)}
                  max={1000}
                  min={0}
                  step={0.1}
                  w={'full'}
                  h={9}
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
            />
          </Box>
        </Flex>
      </ModalBody>
      <ModalFooter justifyContent={'space-between'}>
        {toolId ? (
          <PopoverConfirm
            type="delete"
            content={t('app:confirm_delete_tool')}
            onConfirm={() => onDelete({ toolId })}
            Trigger={
              <Button variant={'whiteDanger'} isLoading={isDeleting}>
                {t('common:Delete')}
              </Button>
            }
          />
        ) : (
          <Box />
        )}

        <Flex gap={4}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button isLoading={isSubmitting || isUploadingAvatar} onClick={handleSubmit(onSubmit)}>
            {isEdit ? t('app:custom_plugin_update') : t('app:custom_plugin_create')}
          </Button>
        </Flex>
      </ModalFooter>
      <AvatarUploader />
    </MyModal>
  );
};

export default WorkflowToolConfigModal;
