/**
 * @file 智能客服助手卡片组件
 * @description 用于显示智能客服应用的基本信息卡片，包含应用头像、名称、简介以及操作按钮（编辑、对话、权限管理）
 * 提供应用信息的快速预览和常用操作的入口
 */
import React, { useState, useMemo } from 'react';
import { Box, Flex, IconButton, HStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useContextSelector } from 'use-context-selector';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { AppRoleList } from '@fastgpt/global/support/permission/app/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { type RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { changeOwner, resumeInheritPer } from '@/web/core/app/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import dynamic from 'next/dynamic';

const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

const AssistantCard = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const onOpenInfoEdit = useContextSelector(AppContext, (v) => v.onOpenInfoEdit);

  const appId = appDetail._id;
  const [editPerAppId, setEditPerAppId] = useState<string>();

  // 直接使用 appDetail 作为 editPerApp，不需要从 myApps 中查找
  const editPerApp = useMemo(
    () => (editPerAppId !== undefined ? appDetail : undefined),
    [editPerAppId, appDetail]
  );

  const { runAsync: onResumeInheritPermission } = useRequest2(
    () => {
      return resumeInheritPer(editPerApp!._id);
    },
    {
      manual: true,
      errorToast: t('common:permission.Resume InheritPermission Failed')
    }
  );

  return (
    <>
      {/* basic info */}
      <Box p={6} position={'relative'}>
        <Flex alignItems={'center'} mb={4}>
          <Avatar src={appDetail.avatar} borderRadius={'md'} w={'32px'} />
          <MyTooltip label={appDetail.name} shouldWrapChildren={false}>
            <Box
              ml={2}
              fontWeight={'500'}
              fontSize={'md'}
              flex={'1 0 0'}
              color={'myGray.600'}
              className="textEllipsis"
            >
              {appDetail.name}
            </Box>
          </MyTooltip>
          {/* 按钮移到标题右侧，只显示图标，顺序为：编辑、对话、权限 */}
          <HStack spacing={2} ml={2}>
            {appDetail.permission.hasManagePer && (
              <IconButton
                size={['smSquare', 'mdSquare']}
                variant={'whitePrimary'}
                icon={<MyIcon name={'edit'} w={'16px'} />}
                aria-label={'edit'}
                onClick={onOpenInfoEdit}
              />
            )}
            <IconButton
              size={['smSquare', 'mdSquare']}
              variant={'whitePrimary'}
              icon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
              aria-label={'chat'}
              onClick={() =>
                router.push(`/chat?appId=${appId}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`)
              }
            />
            {appDetail.permission.hasManagePer && (
              <IconButton
                size={['smSquare', 'mdSquare']}
                variant={'whitePrimary'}
                icon={<MyIcon name={'key'} w={'16px'} />}
                aria-label={'permission'}
                onClick={() => setEditPerAppId(appDetail._id)}
              />
            )}
          </HStack>
        </Flex>
        <MyTooltip
          label={appDetail.intro || t('common:core.app.tip.Add a intro to app')}
          shouldWrapChildren={false}
        >
          <Box
            flex={1}
            className={'textEllipsis2'}
            wordBreak={'break-all'}
            color={'myGray.500'}
            fontSize={'12px'}
            lineHeight={'16px'}
          >
            {appDetail.intro || t('common:core.app.tip.Add a intro to app')}
          </Box>
        </MyTooltip>
      </Box>
      {!!editPerApp && (
        <ConfigPerModal
          {...(editPerApp.permission.isOwner && {
            onChangeOwner: (tmbId: string) =>
              changeOwner({
                appId: editPerApp._id,
                ownerId: tmbId
              })
          })}
          hasParent={false}
          resumeInheritPermission={onResumeInheritPermission}
          isInheritPermission={editPerApp.inheritPermission}
          avatar={editPerApp.avatar}
          name={editPerApp.name}
          managePer={{
            permission: editPerApp.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerApp._id),
            roleList: AppRoleList,
            onUpdateCollaborators: (props: {
              members?: string[];
              groups?: string[];
              orgs?: string[];
              permission: PermissionValueType;
            }) =>
              postUpdateAppCollaborators({
                ...props,
                appId: editPerApp._id
              }),
            onDelOneCollaborator: async (
              props: RequireOnlyOne<{
                tmbId?: string;
                groupId?: string;
                orgId?: string;
              }>
            ) =>
              deleteAppCollaborators({
                ...props,
                appId: editPerApp._id
              }),
            refreshDeps: [editPerApp.inheritPermission]
          }}
          onClose={() => setEditPerAppId(undefined)}
        />
      )}
    </>
  );
};

export default React.memo(AssistantCard);
