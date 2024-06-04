import { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { PermissionList } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { PermissionListType, PermissionValueType } from '@fastgpt/global/support/permission/type';
import { useQuery } from '@tanstack/react-query';
import { ReactNode, useCallback } from 'react';
import { createContext } from 'use-context-selector';

export type MemberManagerInputPropsType = {
  onGetCollaboratorList: () => Promise<CollaboratorItemType[]>;
  permissionList: PermissionListType;
  onUpdateCollaborators: (tmbIds: string[], permission: PermissionValueType) => any;
  onDelOneCollaborator: (tmbId: string) => any;
};
export type MemberManagerPropsType = MemberManagerInputPropsType & {
  collaboratorList: CollaboratorItemType[];
  refetchCollaboratorList: () => void;
  isFetchingCollaborator: boolean;
  getPreLabelList: (per: PermissionValueType) => string[];
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
  getPreLabelList: function (): string[] {
    throw new Error('Function not implemented.');
  },
  refetchCollaboratorList: function (): void {
    throw new Error('Function not implemented.');
  },
  onGetCollaboratorList: function (): Promise<CollaboratorItemType[]> {
    throw new Error('Function not implemented.');
  },
  isFetchingCollaborator: false
});

export const CollaboratorContextProvider = ({
  onGetCollaboratorList,
  permissionList,
  onUpdateCollaborators,
  onDelOneCollaborator,
  children
}: MemberManagerInputPropsType & {
  children: ReactNode;
}) => {
  const {
    data: collaboratorList = [],
    refetch: refetchCollaboratorList,
    isLoading: isFetchingCollaborator
  } = useQuery(['collaboratorList'], onGetCollaboratorList);
  const onUpdateCollaboratorsThen = async (tmbIds: string[], permission: PermissionValueType) => {
    await onUpdateCollaborators(tmbIds, permission);
    refetchCollaboratorList();
  };
  const onDelOneCollaboratorThem = async (tmbId: string) => {
    await onDelOneCollaborator(tmbId);
    refetchCollaboratorList();
  };

  const getPreLabelList = useCallback(
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

  const contextValue = {
    onGetCollaboratorList,
    collaboratorList,
    refetchCollaboratorList,
    isFetchingCollaborator,
    permissionList,
    onUpdateCollaborators: onUpdateCollaboratorsThen,
    onDelOneCollaborator: onDelOneCollaboratorThem,
    getPreLabelList
  };
  return (
    <CollaboratorContext.Provider value={contextValue}>{children}</CollaboratorContext.Provider>
  );
};
