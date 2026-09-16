import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, HStack, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DeleteConfirmInput from '@fastgpt/web/components/common/DeleteConfirmInput';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';

export type BatchDeleteItemType = {
  _id: string;
  name: string;
  isFolder: boolean;
  permission?: {
    isOwner?: boolean;
  };
};

export type CommonBatchDeleteModalProps<T extends BatchDeleteItemType> = {
  type: 'app' | 'skill' | 'dataset';
  items: T[];
  onClose: () => void;
  onSuccess: () => void;
  onDelete: (deletableItems: T[]) => Promise<any>;
};

/**
 * 通用批量删除确认弹窗组件：
 * 1. 过滤无 Owner 权限的资源，并提示「已过滤无删除权限的...」。
 * 2. 动态展示删除描述（区分纯资源、纯文件夹、资源与文件夹混选）。
 * 3. 展现待删除清单（文件夹保持文件夹图标，资源统一使用立方体图标）。
 * 4. 2 个及以上输入「确认删除」确认；单个对象沿用输入对象名称确认。
 */
export const CommonBatchDeleteModal = <T extends BatchDeleteItemType>({
  type,
  items,
  onClose,
  onSuccess,
  onDelete
}: CommonBatchDeleteModalProps<T>) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [inputVal, setInputVal] = useState('');

  // 过滤出真正具有 Owner（删除权限）的项目
  const deletableItems = useMemo(() => items.filter((item) => item.permission?.isOwner), [items]);
  const hasFilteredNoPermission = items.length > deletableItems.length;

  const folderCount = useMemo(
    () => deletableItems.filter((item) => item.isFolder).length,
    [deletableItems]
  );
  const itemCount = useMemo(
    () => deletableItems.length - folderCount,
    [deletableItems, folderCount]
  );

  // 过滤无删除权限提示条文案（静态 literal key 便于脚本检测）
  const filteredTip = useMemo(() => {
    switch (type) {
      case 'app':
        return t('app:filtered_no_delete_permission_tip');
      case 'skill':
        return t('skill:filtered_no_delete_permission_tip');
      case 'dataset':
        return t('dataset:filtered_no_delete_permission_tip');
    }
  }, [t, type]);

  // 确认文本：单个对象沿用对象名称；2 个及以上统一使用「确认删除」
  const targetConfirmText = useMemo(() => {
    if (deletableItems.length <= 1) {
      return deletableItems[0]?.name || t('common:confirm_delete');
    }
    return t('common:confirm_delete');
  }, [deletableItems, t]);

  const isConfirmed = inputVal.trim() === targetConfirmText.trim();

  // 描述提示文案（显式静态映射调用，保留 t('ns:literal_key') 形式）
  const descriptionText = useMemo(() => {
    const isZh = i18n.language?.startsWith('zh');
    const sep = isZh ? '。' : '. ';

    if (type === 'app') {
      const itemsText = t('app:app_count', { count: itemCount });
      const foldersText = t('app:folder_count', { count: folderCount });

      if (folderCount > 0 && itemCount > 0) {
        const title = t('app:delete_apps_and_folders_confirm_title', {
          apps: itemsText,
          folders: foldersText
        });
        return `${title}${sep}${t('app:delete_following_apps_tip')}`;
      }
      if (folderCount > 0 && itemCount === 0) {
        if (folderCount > 1) {
          const title = t('app:delete_folders_confirm_title', { count: folderCount });
          return `${title}${sep}${t('app:delete_following_folders_tip')}`;
        }
        return t('app:confirm_delete_folders_tip');
      }
      if (itemCount > 1) {
        const title = t('app:delete_apps_confirm_title', { count: itemCount });
        return `${title}${sep}${t('app:delete_following_apps_tip')}`;
      }
      return t('app:confirm_delete_apps_tip');
    }

    if (type === 'skill') {
      const itemsText = t('skill:skill_count', { count: itemCount });
      const foldersText = t('skill:folder_count', { count: folderCount });

      if (folderCount > 0 && itemCount > 0) {
        const title = t('skill:delete_skills_and_folders_confirm_title', {
          skills: itemsText,
          folders: foldersText
        });
        return `${title}${sep}${t('skill:delete_following_skills_tip')}`;
      }
      if (folderCount > 0 && itemCount === 0) {
        if (folderCount > 1) {
          const title = t('skill:delete_folders_confirm_title', { count: folderCount });
          return `${title}${sep}${t('skill:delete_following_folders_tip')}`;
        }
        return t('skill:confirm_delete_folders_tip');
      }
      if (itemCount > 1) {
        const title = t('skill:delete_skills_confirm_title', { count: itemCount });
        return `${title}${sep}${t('skill:delete_following_skills_tip')}`;
      }
      return t('skill:confirm_delete_skills_tip');
    }

    // dataset
    const itemsText = t('dataset:dataset_count', { count: itemCount });
    const foldersText = t('dataset:folder_count', { count: folderCount });

    if (folderCount > 0 && itemCount > 0) {
      const title = t('dataset:delete_datasets_and_folders_confirm_title', {
        datasets: itemsText,
        folders: foldersText
      });
      return `${title}${sep}${t('dataset:delete_following_datasets_tip')}`;
    }
    if (folderCount > 0 && itemCount === 0) {
      if (folderCount > 1) {
        const title = t('dataset:delete_folders_confirm_title', { count: folderCount });
        return `${title}${sep}${t('dataset:delete_following_folders_tip')}`;
      }
      return t('dataset:confirm_delete_folders_tip');
    }
    if (itemCount > 1) {
      const title = t('dataset:delete_datasets_confirm_title', { count: itemCount });
      return `${title}${sep}${t('dataset:delete_following_datasets_tip')}`;
    }
    return t('dataset:confirm_delete_datasets_tip');
  }, [folderCount, itemCount, t, i18n.language, type]);

  const { runAsync: onExecuteDelete, loading: isDeleting } = useRequest(
    async () => {
      if (deletableItems.length === 0) return;
      await onDelete(deletableItems);
    },
    {
      onSuccess() {
        toast({
          title: t('common:delete_success'),
          status: 'success'
        });
        onSuccess();
        onClose();
      },
      errorToast: t('common:delete_failed')
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={
        <HStack spacing={'12px'} align={'center'}>
          <Flex
            bg={'yellow.100'}
            borderRadius={'full'}
            p={'4px'}
            align={'center'}
            justify={'center'}
            flexShrink={0}
          >
            <MyIcon name={'common/exclamationMark'} w={'16px'} h={'16px'} color={'yellow.700'} />
          </Flex>
          <Box>{t('common:confirm_delete')}</Box>
        </HStack>
      }
      size={'sm'}
      isCentered
      overflow={'hidden'}
      footer={
        <>
          <Button variant={'whiteBase'} size={'sm'} px={'14px'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button
            variant={'dangerFill'}
            size={'sm'}
            px={'14px'}
            isDisabled={!isConfirmed || deletableItems.length === 0}
            isLoading={isDeleting}
            onClick={onExecuteDelete}
          >
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <Flex flexDirection={'column'} gap={4} flex={'1 1 auto'} minH={0}>
        {/* 过滤无删除权限提示条 */}
        {hasFilteredNoPermission && (
          <Flex
            alignItems={'center'}
            gap={'8px'}
            minH={'28px'}
            px={'12px'}
            py={'4px'}
            bg={'primary.50'}
            borderRadius={'md'}
            w={'full'}
            flexShrink={0}
          >
            <MyIcon
              name={'common/info'}
              w={'14px'}
              h={'14px'}
              color={'primary.600'}
              flexShrink={0}
            />
            <Box fontSize={'14px'} lineHeight={'20px'} color={'primary.600'}>
              {filteredTip}
            </Box>
          </Flex>
        )}

        {/* 动态说明文案 */}
        <Box flexShrink={0}>{descriptionText}</Box>

        {/* 待删除清单展示 */}
        {deletableItems.length > 0 && (
          <Box
            bg={'myGray.25'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            borderRadius={'xs'}
            p={'8px'}
            w={'full'}
            display={'flex'}
            flexDirection={'column'}
            flex={'1 1 auto'}
            minH={0}
          >
            <Box fontWeight={'500'} flexShrink={0}>
              {t('common:will_delete')}
            </Box>
            <VStack
              align={'stretch'}
              spacing={'4px'}
              mt={'10px'}
              flex={'1 1 auto'}
              minH={0}
              overflowY={'auto'}
            >
              {deletableItems.map((item) => (
                <Flex
                  key={item._id}
                  alignItems={'center'}
                  gap={'4px'}
                  color={'myGray.600'}
                  h={'20px'}
                  flexShrink={0}
                >
                  <MyIcon
                    name={item.isFolder ? 'core/app/line/folderClosed' : 'core/app/line/cube'}
                    w={'16px'}
                    h={'16px'}
                    flexShrink={0}
                  />
                  <Box isTruncated title={item.name} flex={1}>
                    {item.name}
                  </Box>
                </Flex>
              ))}
            </VStack>
          </Box>
        )}

        {/* 输入确认区域 */}
        {deletableItems.length > 0 && (
          <Box flexShrink={0}>
            <DeleteConfirmInput
              value={inputVal}
              confirmText={targetConfirmText}
              onChange={setInputVal}
              placeholder={targetConfirmText}
            />
          </Box>
        )}
      </Flex>
    </MyModal>
  );
};

export default React.memo(CommonBatchDeleteModal) as typeof CommonBatchDeleteModal;
