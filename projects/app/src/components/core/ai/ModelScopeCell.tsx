import React from 'react';
import { Box, Flex, Skeleton, type BoxProps } from '@chakra-ui/react';
import AvatarGroup, {
  type AvatarGroupItemType
} from '@fastgpt/web/components/common/Avatar/AvatarGroup';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import { getModelCollaborators, updateModelCollaborators } from '@/web/core/ai/model/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  useModelCollaborators,
  updateModelCollaboratorsCache
} from './hooks/useModelCollaborators';

export type ModelScopeCellProps = BoxProps & {
  modelId?: string;
  scope?: ModelScopeEnum;
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
 * 2. 团队模型未配置可用范围时，默认回退到 "仅自己可用"
 * 3. 显式配置了限定协作者时，展示头像卡片组件（最多 3 个主体重叠展示 + 溢出数字，hover 展示名称 Tooltip）
 * 4. 具有管理权限时，点击单元格可唤起协作者管理弹窗进行配置
 */
const ModelScopeCell = ({
  modelId,
  scope,
  isAccountConfig = false,
  hasManagePer = false,
  selectedHint,
  ...props
}: ModelScopeCellProps) => {
  const { t } = useClientTranslation(['config_model']);
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();

  const isSystem = scope === ModelScopeEnum.system;
  const clbs = useModelCollaborators(modelId);

  const renderContent = () => {
    if (!modelId || !feConfigs.isPlus) {
      return (
        <Box color={'myGray.700'} fontSize={'sm'}>
          -
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
  const canManage = hasManagePer && (!isAccountConfig || !isSystem);

  if (
    !canManage ||
    !modelId ||
    !feConfigs.isPlus ||
    clbs === undefined ||
    !userInfo?.team?.permission
  ) {
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
        permission={userInfo?.team.permission!}
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
