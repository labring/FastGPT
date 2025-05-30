import {
  Box,
  Button,
  Flex,
  FormControl,
  Input,
  ModalBody,
  ModalFooter,
  Textarea,
  HStack,
  Text,
  Tag as ChakraTag,
  TagCloseButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  useDisclosure
} from '@chakra-ui/react';
import type { AppListItemType } from '@fastgpt/global/core/app/type.d';
import type { TagSchemaType } from '@fastgpt/global/core/app/tags';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { putAppById } from '@/web/core/app/api';
import {
  getTeamTags,
  addTagToApp,
  removeTagFromApp,
  batchAddTagsToApp,
  batchRemoveTagsFromApp
} from '@/web/core/app/api/tags';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';

interface AppInfoModalProps {
  app: AppListItemType;
  onClose: () => void;
  onUpdateSuccess?: () => void;
}

const AppInfoModal = ({ app, onClose, onUpdateSuccess }: AppInfoModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isOpen, onOpen, onClose: onClosePopover } = useDisclosure();
  const [appTags, setAppTags] = useState<string[]>(app.tags || []);
  const [availableTags, setAvailableTags] = useState<TagSchemaType[]>([]);
  const [initialTags, setInitialTags] = useState<string[]>(app.tags || []);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { ttsModelList, sttModelList } = useSystemStore();

  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const {
    register,
    setValue,
    watch,
    formState: { errors },
    handleSubmit
  } = useForm({
    defaultValues: {
      name: app.name,
      avatar: app.avatar,
      intro: app.intro
    }
  });
  const avatar = watch('avatar');

  // 获取所有标签
  const { data: tags = [], loading: loadingTags } = useRequest2(
    async () => {
      const result = await getTeamTags();
      return result as TagSchemaType[];
    },
    {
      manual: false,
      refreshDeps: [refreshTrigger],
      onSuccess: (data) => {
        setAvailableTags(data);
      }
    }
  );

  useEffect(() => {
    // 如果应用的标签有变化，通知父组件刷新
    if (app.tags && initialTags && JSON.stringify(app.tags) !== JSON.stringify(initialTags)) {
      setInitialTags([...app.tags]);
      if (onUpdateSuccess) onUpdateSuccess();
    }
  }, [app.tags, initialTags, onUpdateSuccess]);

  // 添加标签到应用
  const { runAsync: addTag, loading: addTagLoading } = useRequest2(
    async (tagId: string) => {
      if (!appTags.includes(tagId)) {
        setAppTags([...appTags, tagId]);
      }
      return tagId;
    },
    {
      onSuccess: (tagId) => {
        onClosePopover();
      }
    }
  );

  // 从应用移除标签
  const { runAsync: removeTag, loading: removeTagLoading } = useRequest2(async (tagId: string) => {
    setAppTags(appTags.filter((id) => id !== tagId));
    return tagId;
  });

  // 保存所有标签更改
  const saveTagChanges = useCallback(async () => {
    const tagsToAdd = appTags.filter((tagId) => !initialTags.includes(tagId));
    const tagsToRemove = initialTags.filter((tagId) => !appTags.includes(tagId));

    let hasChanges = false;

    if (tagsToAdd.length > 0) {
      await batchAddTagsToApp(app._id, tagsToAdd);
      hasChanges = true;
    }

    if (tagsToRemove.length > 0) {
      await batchRemoveTagsFromApp(app._id, tagsToRemove);
      hasChanges = true;
    }

    setInitialTags([...appTags]);

    return hasChanges;
  }, [appTags, initialTags, app._id]);

  // submit config
  const { runAsync: saveSubmitSuccess, loading: btnLoading } = useRequest2(
    async (data: { name: string; avatar: string; intro: string }) => {
      // 使用正确的 API 函数 putAppById
      await putAppById(app._id, {
        name: data.name,
        avatar: data.avatar,
        intro: data.intro
      });

      // 保存标签变更
      const tagsChanged = await saveTagChanges();

      return tagsChanged; // 返回标签是否有变更
    },
    {
      onSuccess(tagsChanged) {
        toast({
          title: t('common:update_success'),
          status: 'success'
        });
        if (onUpdateSuccess) onUpdateSuccess();
        onClose();
      },
      errorToast: t('common:update_failed')
    }
  );

  const saveSubmitError = useCallback(() => {
    const deepSearch = (obj: any): string => {
      if (!obj) return t('common:submit_failed');
      if (!!obj.message) {
        return obj.message;
      }
      return deepSearch(Object.values(obj)[0]);
    };
    toast({
      title: deepSearch(errors),
      status: 'error',
      duration: 4000,
      isClosable: true
    });
  }, [errors, t, toast]);

  const saveUpdateModel = useCallback(
    () => handleSubmit((data) => saveSubmitSuccess(data), saveSubmitError)(),
    [handleSubmit, saveSubmitError, saveSubmitSuccess]
  );

  // 获取标签样式
  const getTagStyle = (color: string) => {
    // 处理自定义颜色 (#XXXXXX)
    if (color.startsWith('#')) {
      return {
        bg: `${color}15`, // 15 表示透明度
        color: color
      };
    }
    // 预设颜色
    const colorMap: Record<string, { bg: string; color: string }> = {
      blue: { bg: 'blue.50', color: 'blue.600' },
      green: { bg: 'green.50', color: 'green.600' },
      red: { bg: 'red.50', color: 'red.600' },
      yellow: { bg: 'yellow.50', color: 'yellow.600' },
      purple: { bg: 'purple.50', color: 'purple.600' },
      teal: { bg: 'teal.50', color: 'teal.600' }
    };
    return colorMap[color] || colorMap.blue;
  };

  // 获取当前选中的标签
  const getSelectedTags = useCallback(() => {
    return tags.filter((tag) => appTags.includes(tag._id));
  }, [tags, appTags]);

  // 获取未选中的标签
  const getUnselectedTags = useCallback(() => {
    return tags.filter((tag) => !appTags.includes(tag._id));
  }, [tags, appTags]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/workflow/ai.svg"
      title={t('common:core.app.setting')}
    >
      <ModalBody>
        <Box fontSize={'sm'}>{t('common:core.app.Name and avatar')}</Box>
        <Flex mt={2} alignItems={'center'}>
          <Avatar
            src={avatar}
            w={['26px', '34px']}
            h={['26px', '34px']}
            cursor={'pointer'}
            borderRadius={'md'}
            mr={4}
            title={t('common:set_avatar')}
            onClick={() => onOpenSelectFile()}
          />
          <FormControl>
            <Input
              bg={'myWhite.600'}
              placeholder={t('common:core.app.Set a name for your app')}
              {...register('name', {
                required: true
              })}
            ></Input>
          </FormControl>
        </Flex>
        <Box mt={4} mb={1} fontSize={'sm'}>
          {t('common:core.app.App intro')}
        </Box>
        <Textarea
          rows={4}
          maxLength={500}
          placeholder={t('common:core.app.Make a brief introduction of your app')}
          bg={'myWhite.600'}
          {...register('intro')}
        />

        {/* 标签管理部分 */}
        <Box mt={4} mb={2} fontSize={'sm'}>
          标签
        </Box>
        <Flex direction="column" gap={2}>
          <Flex wrap="wrap" gap={2} mb={2} minH="30px">
            {getSelectedTags().map((tag) => (
              <ChakraTag
                key={tag._id}
                size="md"
                variant="subtle"
                {...getTagStyle(tag.color)}
                px={3}
                py={1}
                borderRadius="full"
              >
                {tag.name}
                <TagCloseButton onClick={() => removeTag(tag._id)} isDisabled={removeTagLoading} />
              </ChakraTag>
            ))}

            <Popover isOpen={isOpen} onClose={onClosePopover} placement="bottom-start">
              <PopoverTrigger>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<MyIcon name="common/addLight" w="12px" />}
                  onClick={onOpen}
                  isLoading={loadingTags}
                  fontWeight="normal"
                  h="30px"
                >
                  添加标签
                </Button>
              </PopoverTrigger>
              <PopoverContent w="200px">
                <PopoverBody p={2}>
                  {getUnselectedTags().length === 0 ? (
                    <Text fontSize="sm" color="gray.500" textAlign="center" p={2}>
                      没有可添加的标签
                    </Text>
                  ) : (
                    <Flex direction="column" gap={1}>
                      {getUnselectedTags().map((tag) => (
                        <ChakraTag
                          key={tag._id}
                          size="md"
                          variant="subtle"
                          {...getTagStyle(tag.color)}
                          px={3}
                          py={1.5}
                          borderRadius="full"
                          cursor="pointer"
                          onClick={() => addTag(tag._id)}
                          _hover={{ opacity: 0.8 }}
                        >
                          {tag.name}
                        </ChakraTag>
                      ))}
                    </Flex>
                  )}
                </PopoverBody>
              </PopoverContent>
            </Popover>
          </Flex>
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button isLoading={btnLoading} onClick={saveUpdateModel}>
          {t('common:Save')}
        </Button>
      </ModalFooter>

      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e) => setValue('avatar', e)
          })
        }
      />
    </MyModal>
  );
};

export default React.memo(AppInfoModal);
