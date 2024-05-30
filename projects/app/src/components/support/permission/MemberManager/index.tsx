import React, { useState } from 'react';
import { Flex, Box, Button, Tag, TagLabel } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import { AddMemberModal } from './AddMemberModal';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getTeamMembers } from '@/web/support/user/team/api';
import { AppCollaboratorType } from '@fastgpt/global/core/app/type';
import { PermissionListType } from '@fastgpt/service/support/permission/resourcePermission/permisson';
import { createContext } from 'use-context-selector';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import PermissionTags from './PermissionTags';

export type PermissionConfigType = {
  value: PermissionValueType;
  type: 'single' | 'multiple';
  name: string;
  description: string;
}[];

export type MemberManagerPropsType = {
  collaboratorList?: AppCollaboratorType[];
  permissionList: PermissionListType;
  permissionConfig: PermissionConfigType;
  addCollaborators: (tmbIds: string[], permission: PermissionValueType) => any;
};

export type CollaboratorContextType = MemberManagerPropsType & {
  teamMemberList?: TeamMemberItemType[];
};

export const CollaboratorContext = createContext<CollaboratorContextType>(
  {} as CollaboratorContextType
);

function MemberManger({ collaboratorList, ...props }: MemberManagerPropsType) {
  const [addMember, setAddMember] = useState<boolean>();
  const { userInfo } = useUserStore();
  const { data: teamMemberList, refetch } = useQuery(['getMembers'], async () => {
    if (!userInfo?.team?.teamId) return [];
    return (await getTeamMembers()).filter(
      (member) => member.userId != userInfo.team.userId // remove the teamMember itself
    );
  });

  const contextValue: CollaboratorContextType = {
    collaboratorList,
    teamMemberList,
    ...props
  };

  return (
    <CollaboratorContext.Provider value={contextValue}>
      <Flex mt="6" flexDirection="column" gap="2">
        <Flex alignItems="center" flexDirection="row" justifyContent="space-between" w="full">
          <Box>协作者</Box>
          <Flex flexDirection="row" gap="2">
            <Button
              size="sm"
              variant="whitePrimary"
              leftIcon={<MyIcon w="4" name="common/settingLight" />}
            >
              管理
            </Button>
            <Button
              size="sm"
              variant="whitePrimary"
              leftIcon={<MyIcon w="4" name="support/permission/collaborator" />}
              onClick={() => setAddMember(true)}
            >
              添加
            </Button>
          </Flex>
        </Flex>

        <Flex w="full" bg="myGray.100" p="2" gap="2" borderRadius="md" flexDirection="column">
          {collaboratorList?.length === 0 && (
            <Box my="2" mx="auto" color="myGray.600">
              暂无协作者
            </Box>
          )}

          {collaboratorList?.map((collaborator) => {
            const member = teamMemberList?.find(
              (member) => member.tmbId.toString() === collaborator.tmbId.toString()
            );
            return (
              <Tag px="3" py="2" bgColor="white" key={collaborator.tmbId}>
                <Flex justifyContent="space-between" w="full">
                  <Flex alignItems="center">
                    <Avatar src={member?.avatar} w="24px" />
                    <TagLabel ml="2">{member?.memberName}</TagLabel>
                  </Flex>
                  <PermissionTags permission={collaborator.permission} />
                </Flex>
              </Tag>
            );
          })}
        </Flex>
        {addMember && (
          <AddMemberModal
            onClose={() => {
              setAddMember(false);
              refetch();
            }}
          />
        )}
      </Flex>
    </CollaboratorContext.Provider>
  );
}

export default MemberManger;
