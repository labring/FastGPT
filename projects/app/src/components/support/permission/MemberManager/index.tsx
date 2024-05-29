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

export type PermissionConfigType = {
  [key: PermissionValueType]: {
    type: 'single' | 'multiple';
    name: string;
    description: string;
  };
};

export type MemberManagerPropsType = {
  collaboratorList?: AppCollaboratorType[];
  permissionList: PermissionListType;
  permissionConfig: PermissionConfigType;
};

export type CollaboratorContextType = {
  collaboratorList?: AppCollaboratorType[];
  permissionList: PermissionListType;
  permissionConfig: PermissionConfigType;
  teamMemberList?: TeamMemberItemType[];
};

export const CollaboratorContext = createContext<CollaboratorContextType>(
  {} as CollaboratorContextType
);

function MemberManger({
  collaboratorList,
  permissionList,
  permissionConfig
}: MemberManagerPropsType) {
  const [addMember, setAddMember] = useState<boolean>();
  const { userInfo } = useUserStore();
  const { data: teamMemberList } = useQuery(['getMembers'], async () => {
    if (!userInfo?.team?.teamId) return [];
    return (await getTeamMembers(userInfo.team.teamId)).filter(
      (member) => member.userId != userInfo.team.userId // remove the teamMember itself
    );
  });

  const contextValue: CollaboratorContextType = {
    collaboratorList,
    permissionList,
    permissionConfig,
    teamMemberList
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

        <Flex w="full" bg="myGray.100" p="2" gap="2" borderRadius="md">
          {teamMemberList?.length !== 0 && (
            <Box my="2" mx="auto" color="myGray.600">
              暂无协作者
            </Box>
          )}

          {teamMemberList?.map((member) => {
            if (collaboratorList?.find((collaborator) => collaborator.tmbId === member.tmbId)) {
              return (
                <Tag px="3" py="2" bgColor="white" key={member.memberName}>
                  <Avatar src={member.avatar} w="24px" />
                  <TagLabel ml="2">{member.memberName}</TagLabel>
                </Tag>
              );
            }
          })}
        </Flex>
        {addMember && <AddMemberModal onClose={() => setAddMember(false)} />}
      </Flex>
    </CollaboratorContext.Provider>
  );
}

export default MemberManger;
