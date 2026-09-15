import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, HStack, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import DeleteConfirmInput from '@fastgpt/web/components/common/DeleteConfirmInput';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppListItemType } from '@fastgpt/global/core/app/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { delAppById } from '@/web/core/app/api';
import { useToast } from '@fastgpt/web/hooks/useToast';

type BatchDeleteModalProps = {
  apps: AppListItemType[];
  onClose: () => void;
  onSuccess: () => void;
};

const getAppTypeIcon = (type: AppTypeEnum): IconNameType => {
  if (AppFolderTypeList.includes(type)) {
    return 'core/app/line/folderClosed';
  }
  if (
    type === AppTypeEnum.workflowTool ||
    type === AppTypeEnum.httpToolSet ||
    type === AppTypeEnum.httpPlugin
  ) {
    return 'core/app/type/plugin';
  }
  if (type === AppTypeEnum.mcpToolSet) {
    return 'core/app/type/mcpTools';
  }
  if (type === AppTypeEnum.simple || type === AppTypeEnum.chatAgent) {
    return 'core/app/line/cube';
  }
  return 'core/app/line/connect';
};

/**
 * 批量删除确认弹窗组件：
 * 1. 过滤无 Owner 权限的资源，并提示「已过滤无删除权限的应用」。
 * 2. 动态展示删除描述（区分纯应用、纯文件夹、应用与文件夹混选）。
 * 3. 展现待删除清单（类型线性图标与名称）。
 * 4. 2 个及以上输入「确认删除」确认；单个对象沿用输入对象名称确认。
 */
const BatchDeleteModal = ({ apps, onClose, onSuccess }: BatchDeleteModalProps) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [inputVal, setInputVal] = useState('');

  // 过滤出真正具有 Owner（删除权限）的项目
  const deletableApps = useMemo(() => apps.filter((app) => app.permission?.isOwner), [apps]);
  const hasFilteredNoPermission = apps.length > deletableApps.length;

  const folderCount = useMemo(
    () => deletableApps.filter((a) => AppFolderTypeList.includes(a.type)).length,
    [deletableApps]
  );
  const appCount = useMemo(() => deletableApps.length - folderCount, [deletableApps, folderCount]);

  // 确认文本：单个对象沿用对象名称；2 个及以上统一使用「确认删除」
  const targetConfirmText = useMemo(() => {
    if (deletableApps.length <= 1) {
      return deletableApps[0]?.name || t('app:confirm_delete');
    }
    return t('app:confirm_delete');
  }, [deletableApps, t]);

  const isConfirmed = inputVal.trim() === targetConfirmText.trim();

  // 描述提示文案
  const descriptionText = useMemo(() => {
    const isZh = i18n.language?.startsWith('zh');
    const sep = isZh ? '。' : '. ';

    const apps = t('app:app_count', { count: appCount });
    const folders = t('app:folder_count', { count: folderCount });

    if (folderCount > 0 && appCount > 0) {
      const title = t('app:delete_apps_and_folders_confirm_title', {
        apps,
        folders
      });
      return `${title}${sep}${t('app:delete_following_apps_tip')}`;
    }

    if (folderCount > 0 && appCount === 0) {
      if (folderCount > 1) {
        const title = t('app:delete_folders_confirm_title', { count: folderCount });
        return `${title}${sep}${t('app:delete_following_folders_tip')}`;
      }
      return t('app:confirm_delete_folders_tip');
    }

    if (appCount > 1) {
      const title = t('app:delete_apps_confirm_title', { count: appCount });
      return `${title}${sep}${t('app:delete_following_apps_tip')}`;
    }

    return t('app:confirm_delete_apps_tip');
  }, [folderCount, appCount, t, i18n.language]);

  const { runAsync: onExecuteDelete, loading: isDeleting } = useRequest(
    async () => {
      if (deletableApps.length === 0) return;
      const deletePromises = deletableApps.map(async (item) => {
        const deletedIds = await delAppById(item._id);
        deletedIds?.forEach((appId) => {
          localStorage.removeItem(`app_log_keys_${appId}`);
        });
        return deletedIds;
      });
      await Promise.all(deletePromises);
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
          <Box>{t('app:confirm_delete')}</Box>
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
            isDisabled={!isConfirmed || deletableApps.length === 0}
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
              {t('app:filtered_no_delete_permission_tip')}
            </Box>
          </Flex>
        )}

        {/* 动态说明文案 */}
        <Box flexShrink={0}>{descriptionText}</Box>

        {/* 待删除清单展示 */}
        {deletableApps.length > 0 && (
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
              {t('app:will_delete')}
            </Box>
            <VStack
              align={'stretch'}
              spacing={'4px'}
              mt={'10px'}
              flex={'1 1 auto'}
              minH={0}
              overflowY={'auto'}
            >
              {deletableApps.map((item) => (
                <Flex
                  key={item._id}
                  alignItems={'center'}
                  gap={'4px'}
                  color={'myGray.600'}
                  h={'20px'}
                  flexShrink={0}
                >
                  <MyIcon name={getAppTypeIcon(item.type)} w={'16px'} h={'16px'} flexShrink={0} />
                  <Box isTruncated title={item.name} flex={1}>
                    {item.name}
                  </Box>
                </Flex>
              ))}
            </VStack>
          </Box>
        )}

        {/* 输入确认区域 */}
        {deletableApps.length > 0 && (
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

export default BatchDeleteModal;
