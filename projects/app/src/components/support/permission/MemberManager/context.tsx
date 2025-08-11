import { useDisclosure } from '@chakra-ui/react';
import type {
  CollaboratorItemType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';
import { Permission } from '@fastgpt/global/support/permission/controller';
import type {
  PermissionValueType,
  RoleListType,
  RoleValueType
} from '@fastgpt/global/support/permission/type';
import { type ReactNode, useCallback } from 'react';
import { createContext } from 'use-context-selector';
import dynamic from 'next/dynamic';

import MemberListCard, { type MemberListCardProps } from './MemberListCard';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { useTranslation } from 'next-i18next';
import { CommonRoleList } from '@fastgpt/global/support/permission/constant';

const MemberModal = dynamic(() => import('./MemberModal'));
const ManageModal = dynamic(() => import('./ManageModal'));

export type MemberManagerInputPropsType = {
  permission: Permission;
  onGetCollaboratorList: () => Promise<CollaboratorItemType[]>;
  roleList?: RoleListType;
  onUpdateCollaborators: (props: UpdateClbPermissionProps) => Promise<any>;
  onDelOneCollaborator: (
    props: RequireOnlyOne<{ tmbId: string; groupId: string; orgId: string }>
  ) => Promise<any>;
  refreshDeps?: any[];
};

export type MemberManagerPropsType = MemberManagerInputPropsType & {
  collaboratorList: CollaboratorItemType[];
  refetchCollaboratorList: () => void;
  isFetchingCollaborator: boolean;
  getRoleLabelList: (role: RoleValueType) => string[];
};
export type ChildrenProps = {
  onOpenAddMember: () => void;
  onOpenManageModal: () => void;
  MemberListCard: (props: MemberListCardProps) => JSX.Element;
};

type CollaboratorContextType = MemberManagerPropsType & {};

export const CollaboratorContext = createContext<CollaboratorContextType>({
  collaboratorList: [],
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
  onGetCollaboratorList: (): Promise<CollaboratorItemType[]> => {
    throw new Error('Function not implemented.');
  },
  isFetchingCollaborator: false,
  permission: new Permission()
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
  isInheritPermission,
  hasParent,
  addPermissionOnly
}: MemberManagerInputPropsType & {
  children: (props: ChildrenProps) => ReactNode;
  refetchResource?: () => void;
  isInheritPermission?: boolean;
  hasParent?: boolean;
  addPermissionOnly?: boolean;
}) => {
  const { t } = useTranslation();
  const onUpdateCollaboratorsThen = async (props: UpdateClbPermissionProps) => {
    await onUpdateCollaborators(props);
    refetchCollaboratorList();
  };
  const onDelOneCollaboratorThen = async (
    props: RequireOnlyOne<{ tmbId: string; groupId: string; orgId: string }>
  ) => {
    await onDelOneCollaborator(props);
    refetchCollaboratorList();
  };

  const { feConfigs } = useSystemStore();

  const {
    data: collaboratorList = [],
    runAsync: refetchCollaboratorList,
    loading: isFetchingCollaborator
  } = useRequest2(
    async () => {
      if (feConfigs.isPlus) {
        const data = await onGetCollaboratorList();
        return data.map((item) => {
          return {
            ...item,
            permission: new Permission({
              role: item.permission.role
            })
          };
        });
      }
      return [];
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

  const { ConfirmModal, openConfirm } = useConfirm({});
  const {
    isOpen: isOpenAddMember,
    onOpen: onOpenAddMember,
    onClose: onCloseAddMember
  } = useDisclosure();
  const {
    isOpen: isOpenManageModal,
    onOpen: onOpenManageModal,
    onClose: onCloseManageModal
  } = useDisclosure();

  const contextValue = {
    permission,
    onGetCollaboratorList,
    collaboratorList,
    refetchCollaboratorList,
    isFetchingCollaborator,
    roleList,
    onUpdateCollaborators: onUpdateCollaboratorsThen,
    onDelOneCollaborator: onDelOneCollaboratorThen,
    getRoleLabelList
  };

  const onOpenAddMemberModal = () => {
    if (isInheritPermission && hasParent) {
      openConfirm(
        () => {
          onOpenAddMember();
        },
        undefined,
        t('common:permission.Remove InheritPermission Confirm')
      )();
    } else {
      onOpenAddMember();
    }
  };
  const onOpenManageModalModal = () => {
    if (isInheritPermission && hasParent) {
      openConfirm(
        () => {
          onOpenManageModal();
        },
        undefined,
        t('common:permission.Remove InheritPermission Confirm')
      )();
    } else {
      onOpenManageModal();
    }
  };
  return (
    <CollaboratorContext.Provider value={contextValue}>
      {children({
        onOpenAddMember: onOpenAddMemberModal,
        onOpenManageModal: onOpenManageModalModal,
        MemberListCard
      })}
      {isOpenAddMember && (
        <MemberModal
          onClose={() => {
            onCloseAddMember();
            refetchResource?.();
          }}
          addPermissionOnly={addPermissionOnly}
        />
      )}
      {isOpenManageModal && (
        <ManageModal
          onClose={() => {
            onCloseManageModal();
            refetchResource?.();
          }}
        />
      )}
      <ConfirmModal />
    </CollaboratorContext.Provider>
  );
};

export default CollaboratorContextProvider;
