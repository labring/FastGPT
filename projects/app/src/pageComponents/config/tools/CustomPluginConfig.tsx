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
import {
  delPlugin,
  getAllUserPlugins,
  getPluginTags,
  postCreatePlugin,
  putUpdatePlugin
} from '@/web/core/app/api/plugin';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { PluginStatusEnum } from '@fastgpt/global/core/app/plugin/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useTranslation } from 'next-i18next';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { getSystemPluginsQuery } from '@/pages/api/core/app/plugin/list';

type EditCustomPluginType = {
  id?: string;
  pluginTags?: string[];
  name: string;
  avatar: string;
  intro?: string;
  originCost?: number;
  currentCost?: number;
  hasTokenFee?: boolean;
  status?: number;
  defaultInstalled?: boolean;
  associatedPluginId?: string;
  userGuide?: string;
  author?: string;

  inputList?: FlowNodeInputItemType['inputList'];
  inputListVal?: Record<string, any>;

  // @deprecated
  templateType?: string;
};

export const defaultCustomPluginForm: EditCustomPluginType = {
  id: '',
  pluginTags: [],
  name: '',
  avatar: 'core/app/type/pluginFill',
  intro: '',
  status: PluginStatusEnum.Normal,
  defaultInstalled: false,
  hasTokenFee: false,
  originCost: 0,
  currentCost: 0,
  userGuide: '',

  inputList: [],
  inputListVal: {}
};

const CustomPluginConfig = ({
  defaultForm = defaultCustomPluginForm,
  onSuccess,
  onClose
}: {
  defaultForm: EditCustomPluginType;
  onSuccess: (data: getSystemPluginsQuery) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const isEdit = !!defaultForm.id;
  const { toast } = useToast();

  const [searchKey, setSearchKey] = useState('');
  const [lastPluginId, setLastPluginId] = useState<string | undefined>('');

  const { data: plugins = [], loading: loadingPlugins } = useRequest2(
    () => getAllUserPlugins({ searchKey }),
    {
      manual: false,
      refreshDeps: [searchKey]
    }
  );

  const { register, setValue, watch, handleSubmit } = useForm({
    defaultValues: defaultForm
  });
  const name = watch('name');
  const avatar = watch('avatar');
  const pluginTags = watch('pluginTags');
  const associatedPluginId = watch('associatedPluginId');
  const currentCost = watch('currentCost');
  const status = watch('status');
  const defaultInstalled = watch('defaultInstalled');

  const {
    value: selectedTags,
    setValue: setSelectedTags,
    isSelectAll: isSelectAllTags,
    setIsSelectAll: setIsSelectAllTags
  } = useMultipleSelect<string>(pluginTags || [], false);

  React.useEffect(() => {
    setValue('pluginTags', selectedTags);
  }, [selectedTags, setValue]);

  const currentPlugin = useMemo(() => {
    return plugins.find((item) => item._id === associatedPluginId);
  }, [plugins, associatedPluginId]);

  const { data: tags = [], loading: loadingTags } = useRequest2(getPluginTags, {
    manual: false
  });
  const pluginTypeSelectList = useMemo(
    () =>
      tags?.map((tag) => ({
        label:
          typeof tag.tagName === 'string' ? tag.tagName : tag.tagName['zh-CN'] || tag.tagName['en'],
        value: tag.tagId
      })) || [],
    [tags]
  );

  const {
    isOpen: isOpenPluginListMenu,
    onClose: onClosePluginListMenu,
    onOpen: onOpenPluginListMenu
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

  const { runAsync: onSubmit, loading } = useRequest2(
    (data: EditCustomPluginType) => {
      if (!data.associatedPluginId) {
        return Promise.reject(t('app:custom_plugin_associated_plugin_required'));
      }

      const formatData = {
        pluginId: defaultForm.id ? defaultForm.id : '',
        name: data.name,
        avatar: data.avatar,
        intro: data.intro,
        inputListVal: data.inputListVal,
        pluginTags: data.pluginTags && data.pluginTags.length > 0 ? data.pluginTags : undefined,
        status: data.status,
        defaultInstalled: data.defaultInstalled,
        hasTokenFee: data.hasTokenFee,
        originCost: data.originCost,
        currentCost: data.currentCost,
        associatedPluginId: data.associatedPluginId,
        userGuide: data.userGuide,
        author: data.author
      };

      if (formatData.pluginId) {
        return putUpdatePlugin(formatData);
      }

      return postCreatePlugin(formatData);
    },
    {
      onSuccess: () => {
        toast({
          title: t('app:custom_plugin_config_success'),
          status: 'success'
        });
        onSuccess({});
        onClose();
      },
      onError() {},
      refreshDeps: [defaultForm.id]
    }
  );

  const { runAsync: onDelete, loading: isDeleting } = useRequest2(delPlugin, {
    onSuccess() {
      toast({
        title: t('app:custom_plugin_delete_success'),
        status: 'success'
      });
      onSuccess({});
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
      <ModalBody flex={1} overflow={'auto'} w={'full'}>
        <Flex w={'full'} gap={5}>
          <Box w={'full'}>
            <Box color={'myGray.800'} fontWeight={'bold'}>
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
            <Box mt={3}>
              <Box fontSize={'sm'} fontWeight={'medium'} mb={2}>
                {t('app:custom_plugin_intro_label')}
              </Box>
              <Textarea
                {...register('intro')}
                bg={'myGray.50'}
                placeholder={t('app:custom_plugin_intro_placeholder')}
              />
            </Box>
            <HStack mt={3}>
              <Box flex={'0 0 140px'} fontSize={'sm'} fontWeight={'medium'}>
                {t('app:custom_plugin_associated_plugin_label')}
              </Box>
              <Flex flex={'1 0 0'} flexDirection={'column'}>
                {associatedPluginId && (
                  <Avatar
                    src={currentPlugin?.avatar}
                    mt={2}
                    ml={2}
                    w={'20px'}
                    borderRadius={'2px'}
                    position="absolute"
                  />
                )}
                <Input
                  pl={associatedPluginId ? 8 : 4}
                  fontSize={'14px'}
                  placeholder={t('app:custom_plugin_associated_plugin_placeholder')}
                  value={currentPlugin?.name}
                  onChange={(e) => {
                    setSearchKey(e.target.value);
                  }}
                  onFocus={() => {
                    onOpenPluginListMenu();
                    setLastPluginId(associatedPluginId);
                    setValue('associatedPluginId', undefined);
                  }}
                  onBlur={() => {
                    onClosePluginListMenu();
                    if (associatedPluginId) return;
                    setValue('associatedPluginId', lastPluginId);
                  }}
                />
                {isOpenPluginListMenu && plugins.length > 0 && (
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
                    {plugins.map((item) => (
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
                          onClosePluginListMenu();
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
            <HStack mt={3}>
              <Box flex={'0 0 140px'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
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
                isSelectAll={isSelectAllTags}
                setIsSelectAll={(val) => {
                  if (val && pluginTypeSelectList.length > 3) {
                    toast({
                      title: t('app:custom_plugin_tags_max_limit'),
                      status: 'warning'
                    });
                    return;
                  }
                  setIsSelectAllTags(val);
                }}
                placeholder={t('app:custom_plugin_tags_label')}
                maxW={270}
              />
            </HStack>
            <HStack mt={3}>
              <Box flex={'0 0 140px'} fontSize={'sm'} fontWeight={'medium'}>
                {t('app:custom_plugin_author_label')}
              </Box>
              <Box flex={1}>
                <Input
                  placeholder={t('app:custom_plugin_author_placeholder')}
                  {...register('author')}
                />
              </Box>
            </HStack>
            <HStack mt={3}>
              <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
                {t('app:custom_plugin_plugin_status_label')}
              </Box>
              <MySelect
                value={status}
                w={'full'}
                list={[
                  { label: t('app:toolkit_status_normal'), value: PluginStatusEnum.Normal },
                  {
                    label: t('app:toolkit_status_soon_offline'),
                    value: PluginStatusEnum.SoonOffline
                  },
                  { label: t('app:toolkit_status_offline'), value: PluginStatusEnum.Offline }
                ]}
                onChange={(e) => {
                  const newStatus = Number(e);
                  setValue('status', newStatus);
                  if (newStatus !== PluginStatusEnum.Normal) {
                    setValue('defaultInstalled', false);
                  }
                }}
              />
            </HStack>
            <HStack mt={3}>
              <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
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
            <HStack mt={5}>
              <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
                {t('app:custom_plugin_has_token_fee_label')}
              </Box>
              <Switch {...register('hasTokenFee')} />
            </HStack>
            <HStack mt={5}>
              <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
                {t('app:custom_plugin_call_price_label')}
              </Box>
              <MyNumberInput
                value={currentCost ?? 0}
                onChange={(e) => setValue('currentCost', e ?? 0)}
                max={1000}
                min={0}
                step={0.1}
              />
            </HStack>
          </Box>
          <Box w={'full'}>
            <Box mb={'9px'} fontSize={'sm'} fontWeight={'medium'}>
              {t('app:custom_plugin_user_guide_label')}
            </Box>
            <Textarea
              {...register('userGuide')}
              placeholder={t('app:custom_plugin_user_guide_placeholder')}
              bg={'myGray.50'}
              minH={'472px'}
            />
          </Box>
        </Flex>
      </ModalBody>
      <ModalFooter justifyContent={'space-between'}>
        {defaultForm.id ? (
          <PopoverConfirm
            type="delete"
            content={t('app:custom_plugin_delete_confirm')}
            onConfirm={() => onDelete({ id: defaultForm.id! })}
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
          <Button isLoading={loading || isUploadingAvatar} onClick={handleSubmit(onSubmit)}>
            {isEdit ? t('app:custom_plugin_update') : t('app:custom_plugin_create')}
          </Button>
        </Flex>
      </ModalFooter>
      <AvatarUploader />
    </MyModal>
  );
};

export default CustomPluginConfig;
