import React from 'react';
import { Box, Flex, Skeleton, type BoxProps } from '@chakra-ui/react';
import AvatarGroup, {
  type AvatarGroupItemType
} from '@fastgpt/web/components/common/Avatar/AvatarGroup';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import {
  getModelCollaborators,
  updateModelCollaborators
} from '@/web/core/ai/model/collaboratorApi';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  useModelCollaborators,
  clearModelCollaboratorsCache,
  updateModelCollaboratorsCache
} from '@/web/core/ai/model/useModelCollaborators';

export type ModelScopeCellProps = BoxProps & {
  modelId?: string;
  scope?: ModelScopeEnum;
  /** 团队模型的归属成员，用于区分所有者与共享接收方。 */
  ownerTmbId?: string | null;
  /** 是否为账号下的模型配置表格（系统模型在模型配置中只读不可配） */
  isAccountConfig?: boolean;
  /** 当前用户是否有管理权限 */
  hasManagePer?: boolean;
  selectedHint?: string;
};

/**
 * 模型可用范围单元格组件
 *
 * 业务与交互规范：
 * 1. 系统模型未配置可用范围时，默认回退到 "全员可用"
 * 2. 团队模型所有者未配置可用范围时展示 "仅自己可用"，共享接收方展示 "与我共享"
 * 3. 显式配置了限定协作者时，展示头像卡片组件（最多 3 个主体重叠展示 + 溢出数字，hover 展示名称 Tooltip）
 * 4. 团队模型仅所有者可编辑可用范围；系统模型按管理权限控制编辑入口
 */
const ModelScopeCell = ({
  modelId,
  scope,
  ownerTmbId,
  isAccountConfig = false,
  hasManagePer = false,
  selectedHint,
  ...props
}: ModelScopeCellProps) => {
  const { t } = useSafeTranslation();
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();

  const isSystem = scope === ModelScopeEnum.system;
  const isTeam = scope === ModelScopeEnum.team;
  const isOwner = Boolean(ownerTmbId && ownerTmbId === userInfo?.team.tmbId);
  const isShared = isTeam && !isOwner;
  // 共享接收方只展示授权关系，不请求其无权查看的完整协作者名单。
  const { clbs, failed } = useModelCollaborators(isShared ? undefined : modelId);

  const renderContent = () => {
    if (!modelId || !feConfigs.isPlus) {
      return (
        <Box color={'myGray.700'} fontSize={'sm'}>
          -
        </Box>
      );
    }

    if (isShared) {
      return (
        <Box color={'myGray.700'} fontSize={'sm'}>
          {t('config_model:shared_with_me')}
        </Box>
      );
    }

    if (failed) {
      return (
        <Box
          as="button"
          color="myGray.500"
          fontSize="sm"
          data-row-action
          onClick={() => clearModelCollaboratorsCache(modelId)}
        >
          {t('common:load_failed')}
        </Box>
      );
    }

    if (clbs === undefined) {
      return <Skeleton w={'48px'} h={'16px'} borderRadius={'xs'} />;
    }

    // 显式配置了可用范围，使用 AvatarGroup 展示协作者
    if (clbs.length > 0) {
      const items: AvatarGroupItemType[] = clbs.map((clb) => ({
        avatar: clb.avatar,
        name: clb.name === DefaultGroupName ? (userInfo?.team.teamName ?? clb.name) : clb.name
      }));
      return <AvatarGroup items={items} max={3} total={clbs.length} size={'20px'} offset={6} />;
    }

    // 系统模型未配置可用范围时，默认回退到全员可用
    if (isSystem) {
      return (
        <Box color={'myGray.700'} fontSize={'sm'}>
          {t('config_model:available_to_all')}
        </Box>
      );
    }

    // 团队模型未配置可用范围时，默认回退到仅自己可用
    return (
      <Box color={'myGray.700'} fontSize={'sm'}>
        {t('config_model:only_available_to_self')}
      </Box>
    );
  };

  const content = renderContent();
  const canManage = isTeam ? isOwner : hasManagePer && (!isAccountConfig || !isSystem);
  const teamPermission = userInfo?.team?.permission;

  if (!canManage || !modelId || !feConfigs.isPlus || clbs === undefined || !teamPermission) {
    return <Box {...props}>{content}</Box>;
  }

  return (
    <Box {...props}>
      <LazyCollaboratorProvider
        selectedHint={selectedHint ?? t('config_model:available_range')}
        defaultRole={ReadRoleVal}
        onGetCollaboratorList={async () => {
          const res = await getModelCollaborators(modelId);
          updateModelCollaboratorsCache(modelId, res.clbs ?? []);
          return res;
        }}
        onUpdateCollaborators={async ({ collaborators }) => {
          await updateModelCollaborators({
            collaborators,
            modelIds: [modelId]
          });
          const res = await getModelCollaborators(modelId);
          updateModelCollaboratorsCache(modelId, res.clbs ?? []);
        }}
        permission={teamPermission}
      >
        {({ onOpenManageModal }) => (
          <Flex
            alignItems={'center'}
            cursor={'pointer'}
            w={'fit-content'}
            data-row-action
            onClick={onOpenManageModal}
          >
            {content}
          </Flex>
        )}
      </LazyCollaboratorProvider>
    </Box>
  );
};

export default React.memo(ModelScopeCell);
