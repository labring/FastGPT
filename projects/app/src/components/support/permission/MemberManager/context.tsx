import { useDisclosure } from '@chakra-ui/react';
import type {
  CollaboratorItemType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';
import { PermissionList } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import type {
  PermissionListType,
  PermissionValueType
} from '@fastgpt/global/support/permission/type';
import { type ReactNode, useCallback } from 'react';
import { createContext } from 'use-context-selector';
import dynamic from 'next/dynamic';

import MemberListCard, { type MemberListCardProps } from './MemberListCard';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useI18n } from '@/web/context/I18n';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';

const MemberModal = dynamic(() => import('./MemberModal'));
const ManageModal = dynamic(() => import('./ManageModal'));

export type MemberManagerInputPropsType = {
  permission: Permission;
  onGetCollaboratorList: () => Promise<CollaboratorItemType[]>;
  permissionList?: PermissionListType;
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
  onUpdateCollaborators: () => {
    throw new Error('Function not implemented.');
  },
  onDelOneCollaborator: () => {
    throw new Error('Function not implemented.');
  },
  getPerLabelList: (): string[] => {
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
  permissionList,
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
      if (!permissionList) return [];

      const Per = new Permission({ per });
      const labels: string[] = [];

      if (Per.hasManagePer) {
        labels.push(permissionList['manage'].name);
      } else if (Per.hasWritePer) {
        labels.push(permissionList['write'].name);
      } else if (Per.hasReadPer) {
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
