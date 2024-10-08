import { useDisclosure } from '@chakra-ui/react';
import {
  CollaboratorItemType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';
import { PermissionList } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { PermissionListType, PermissionValueType } from '@fastgpt/global/support/permission/type';
import { ReactNode, useCallback } from 'react';
import { createContext } from 'use-context-selector';
import dynamic from 'next/dynamic';

import MemberListCard, { MemberListCardProps } from './MemberListCard';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useI18n } from '@/web/context/I18n';
const AddMemberModal = dynamic(() => import('./AddMemberModal'));
const ManageModal = dynamic(() => import('./ManageModal'));

export type MemberManagerInputPropsType = {
  permission: Permission;
  onGetCollaboratorList: () => Promise<CollaboratorItemType[]>;
  permissionList: PermissionListType;
  onUpdateCollaborators: (props: any) => any; // TODO: type. should be UpdatePermissionBody after app and dataset permission refactored
  onDelOneCollaborator: (tmbId: string) => any;
  refreshDeps?: any[];
};
export type MemberManagerPropsType = MemberManagerInputPropsType & {
  collaboratorList: CollaboratorItemType[];
  refetchCollaboratorList: () => void;
  isFetchingCollaborator: boolean;
  getPerLabelList: (per: PermissionValueType) => string[];
};
export type ChildrenProps = {
  onOpenAddMember: () => void;
  onOpenManageModal: () => void;
  MemberListCard: (props: MemberListCardProps) => JSX.Element;
};

type CollaboratorContextType = MemberManagerPropsType & {};

export const CollaboratorContext = createContext<CollaboratorContextType>({
  collaboratorList: [],
  permissionList: PermissionList,
  onUpdateCollaborators: function () {
    throw new Error('Function not implemented.');
  },
  onDelOneCollaborator: function () {
    throw new Error('Function not implemented.');
  },
  getPerLabelList: function (): string[] {
    throw new Error('Function not implemented.');
  },
  refetchCollaboratorList: function (): void {
    throw new Error('Function not implemented.');
  },
  onGetCollaboratorList: function (): Promise<CollaboratorItemType[]> {
    throw new Error('Function not implemented.');
  },
  isFetchingCollaborator: false,
  permission: new Permission()
});

const CollaboratorContextProvider = ({
  permission,
  onGetCollaboratorList,
  permissionList,
  onUpdateCollaborators,
  onDelOneCollaborator,
  children,
  refetchResource,
  refreshDeps = [],
  isInheritPermission,
  hasParent
}: MemberManagerInputPropsType & {
  children: (props: ChildrenProps) => ReactNode;
  refetchResource?: () => void;
  isInheritPermission?: boolean;
  hasParent?: boolean;
}) => {
  const onUpdateCollaboratorsThen = async (props: UpdateClbPermissionProps) => {
    await onUpdateCollaborators(props);
    refetchCollaboratorList();
  };
  const onDelOneCollaboratorThen = async (tmbId: string) => {
    await onDelOneCollaborator(tmbId);
    refetchCollaboratorList();
  };

  const { feConfigs } = useSystemStore();
  const { commonT } = useI18n();

  const {
    data: collaboratorList = [],
    runAsync: refetchCollaboratorList,
    loading: isFetchingCollaborator
  } = useRequest2(
    async () => {
      if (feConfigs.isPlus) {
        return onGetCollaboratorList();
      }
      return [];
    },
    {
      manual: false,
      refreshDeps: refreshDeps
    }
  );

  const getPerLabelList = useCallback(
    (per: PermissionValueType) => {
      const Per = new Permission({ per });
      const labels: string[] = [];

      if (Per.hasManagePer) {
        labels.push(permissionList['manage'].name);
      } else if (Per.hasWritePer) {
        labels.push(permissionList['write'].name);
      } else {
        labels.push(permissionList['read'].name);
      }

      Object.values(permissionList).forEach((item) => {
        if (item.checkBoxType === 'multiple') {
          if (Per.checkPer(item.value)) {
            labels.push(item.name);
          }
        }
      });

      return labels;
    },
    [permissionList]
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
    permissionList,
    onUpdateCollaborators: onUpdateCollaboratorsThen,
    onDelOneCollaborator: onDelOneCollaboratorThen,
    getPerLabelList
  };

  const onOpenAddMemberModal = () => {
    if (isInheritPermission && hasParent) {
      openConfirm(
        () => {
          onOpenAddMember();
        },
        undefined,
        commonT('permission.Remove InheritPermission Confirm')
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
        commonT('permission.Remove InheritPermission Confirm')
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
        <AddMemberModal
          onClose={() => {
            onCloseAddMember();
            refetchResource?.();
          }}
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
