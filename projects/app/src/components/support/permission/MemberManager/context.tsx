import { BoxProps, useDisclosure } from '@chakra-ui/react';
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
const AddMemberModal = dynamic(() => import('./AddMemberModal'));
const ManageModal = dynamic(() => import('./ManageModal'));

export type MemberManagerInputPropsType = {
  permission: Permission;
  onGetCollaboratorList: () => Promise<CollaboratorItemType[]>;
  permissionList: PermissionListType;
  onUpdateCollaborators: (props: UpdateClbPermissionProps) => any;
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
  refreshDeps = [],
  children
}: MemberManagerInputPropsType & {
  children: (props: ChildrenProps) => ReactNode;
}) => {
  const { feConfigs } = useSystemStore();

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
      refreshDeps
    }
  );

  const onUpdateCollaboratorsThen = async (props: UpdateClbPermissionProps) => {
    await onUpdateCollaborators(props);
    refetchCollaboratorList();
  };
  const onDelOneCollaboratorThen = async (tmbId: string) => {
    await onDelOneCollaborator(tmbId);
    refetchCollaboratorList();
  };

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
  return (
    <CollaboratorContext.Provider value={contextValue}>
      {children({ onOpenAddMember, onOpenManageModal, MemberListCard })}
      {isOpenAddMember && <AddMemberModal onClose={onCloseAddMember} />}
      {isOpenManageModal && <ManageModal onClose={onCloseManageModal} />}
    </CollaboratorContext.Provider>
  );
};

export default CollaboratorContextProvider;
