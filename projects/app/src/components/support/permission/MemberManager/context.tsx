import { useDisclosure } from '@chakra-ui/react';
import type {
  CollaboratorItemDetailType,
  CollaboratorListType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';
import { Permission } from '@fastgpt/global/support/permission/controller';
import type {
  PermissionValueType,
  RoleListType,
  RoleValueType
} from '@fastgpt/global/support/permission/type';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import dynamic from 'next/dynamic';

import MemberListCard, { type MemberListCardProps } from './MemberListCard';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { useTranslation } from 'next-i18next';
import { CommonRoleList, NullRoleVal } from '@fastgpt/global/support/permission/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import LightTip from '@fastgpt/web/components/common/LightTip';

const MemberModal = dynamic(() => import('./MemberModal'));

export type MemberManagerInputPropsType = {
  permission: Permission;
  defaultRole: RoleValueType;
  onGetCollaboratorList: () => Promise<CollaboratorListType>;
  roleList?: RoleListType;
  onUpdateCollaborators: (props: UpdateClbPermissionProps) => Promise<any>;
  onDelOneCollaborator?: (
    props: RequireOnlyOne<{ tmbId: string; groupId: string; orgId: string }>
  ) => Promise<any>;
  refreshDeps?: any[];
};

export type CollaboratorContextType = MemberManagerInputPropsType & {
  collaboratorList: CollaboratorItemDetailType[];
  parentClbList: CollaboratorItemDetailType[];
  myRole: Permission;
  refetchCollaboratorList: () => void;
  isFetchingCollaborator: boolean;
  getRoleLabelList: (role: RoleValueType) => string[];
  isInheritPermission?: boolean;
};

export type ChildrenProps = {
  onOpenManageModal: () => void;
  MemberListCard: (props: MemberListCardProps) => JSX.Element;
};

export const CollaboratorContext = createContext<CollaboratorContextType>({
  myRole: new Permission(),
  defaultRole: NullRoleVal,
  collaboratorList: [],
  parentClbList: [],
  roleList: CommonRoleList,
  onUpdateCollaborators: () => {
    throw new Error('Function not implemented.');
  },
  onDelOneCollaborator: () => {
    throw new Error('Function not implemented.');
  },
  getRoleLabelList: (): string[] => {
    throw new Error('Function not implemented.');
  },
  refetchCollaboratorList: (): void => {
    throw new Error('Function not implemented.');
  },
  onGetCollaboratorList: (): Promise<CollaboratorListType> => {
    throw new Error('Function not implemented.');
  },
  isFetchingCollaborator: false,
  permission: new Permission(),
  isInheritPermission: false
});

const CollaboratorContextProvider = ({
  permission,
  onGetCollaboratorList,
  roleList,
  onUpdateCollaborators,
  onDelOneCollaborator,
  children,
  refetchResource,
  refreshDeps = [],
  defaultRole,
  isInheritPermission,
  selectedHint
}: MemberManagerInputPropsType & {
  children: (props: ChildrenProps) => ReactNode;
  refetchResource?: () => void;
  isInheritPermission?: boolean;
  hasParent?: boolean;
  addPermissionOnly?: boolean;
  selectedHint?: string;
}) => {
  const { t } = useTranslation();
  const onUpdateCollaboratorsThen = async (props: UpdateClbPermissionProps) => {
    await onUpdateCollaborators(props);
    refetchCollaboratorList();
  };
  const onDelOneCollaboratorThen = async (
    props: RequireOnlyOne<{ tmbId: string; groupId: string; orgId: string }>
  ) => {
    if (onDelOneCollaborator) {
      await onDelOneCollaborator(props);
      refetchCollaboratorList();
    }
  };

  const { feConfigs } = useSystemStore();

  const {
    data: { clbs: collaboratorList = [], parentClbs: parentClbList = [] } = {
      clbs: [],
      parentClbs: []
    },
    runAsync: refetchCollaboratorList,
    loading: isFetchingCollaborator
  } = useRequest2(
    async () => {
      if (feConfigs.isPlus) {
        const { clbs, parentClbs = [] } = await onGetCollaboratorList();
        return {
          clbs: clbs.map((clb) => ({
            ...clb,
            permission: new Permission({ role: clb.permission.role })
          })),
          parentClbs: parentClbs.map((clb) => ({
            ...clb,
            permission: new Permission({ role: clb.permission.role })
          }))
        };
      }
      return {
        clbs: [],
        parentClbs: []
      };
    },
    {
      manual: false,
      refreshDeps: refreshDeps
    }
  );

  const getRoleLabelList = useCallback(
    (role: PermissionValueType) => {
      if (!roleList) return [];

      const Per = new Permission({ role });
      const labels: string[] = [];

      if (Per.isOwner) {
        return [t('common:permission.Owner')];
      }
      if (Per.hasManagePer) {
        labels.push(t(roleList['manage'].name as any));
      } else if (Per.hasWritePer) {
        labels.push(t(roleList['write'].name as any));
      } else if (Per.hasReadPer) {
        labels.push(t(roleList['read'].name as any));
      }

      Object.values(roleList).forEach((item) => {
        if (item.checkBoxType === 'multiple') {
          if (Per.checkRole(item.value)) {
            labels.push(t(item.name as any));
          }
        }
      });

      return labels;
    },
    [roleList]
  );

  const {
    isOpen: isOpenManageModal,
    onOpen: onOpenManageModal,
    onClose: onCloseManageModal
  } = useDisclosure();

  const { userInfo } = useUserStore();
  const myRole = useMemo(() => {
    return (
      collaboratorList.find((v) => v.tmbId === userInfo?.team?.tmbId)?.permission ??
      new Permission({
        isOwner: userInfo?.team.permission.isOwner
      })
    );
  }, [collaboratorList, userInfo?.team.permission.isOwner, userInfo?.team?.tmbId]);

  const contextValue = {
    permission,
    onGetCollaboratorList,
    collaboratorList,
    refetchCollaboratorList,
    isFetchingCollaborator,
    roleList,
    onUpdateCollaborators: onUpdateCollaboratorsThen,
    onDelOneCollaborator: onDelOneCollaboratorThen,
    getRoleLabelList,
    defaultRole,
    parentClbList,
    myRole,
    isInheritPermission
  };

  return (
    <CollaboratorContext.Provider value={contextValue}>
      {children({
        onOpenManageModal,
        MemberListCard
      })}
      {isOpenManageModal && (
        <MemberModal
          onClose={() => {
            onCloseManageModal();
            refetchResource?.();
          }}
          SelectedTip={selectedHint ? <LightTip text={selectedHint} /> : undefined}
        />
      )}
    </CollaboratorContext.Provider>
  );
};

export default CollaboratorContextProvider;

export const LazyCollaboratorProvider = ({
  children,
  ...props
}: {
  children: (params: { onOpenManageModal: () => void }) => React.ReactNode;
} & React.ComponentProps<typeof CollaboratorContextProvider>) => {
  const [isProviderMounted, setIsProviderMounted] = useState(false);

  const handleOpen = useCallback(() => {
    setIsProviderMounted(true);
  }, []);

  // 如果还未挂载 Provider，只渲染触发按钮
  if (!isProviderMounted) {
    return <>{children({ onOpenManageModal: handleOpen })}</>;
  }

  // Provider 已挂载，渲染完整的协作者管理功能
  return (
    <CollaboratorContextProvider {...props}>
      {({ onOpenManageModal }) => {
        // 组件挂载后自动打开模态框
        useEffect(() => {
          onOpenManageModal();
        }, [onOpenManageModal]);

        return <>{children({ onOpenManageModal })}</>;
      }}
    </CollaboratorContextProvider>
  );
};
