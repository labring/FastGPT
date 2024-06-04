import React, { useState } from 'react';
import { Flex, Box, Button, Tag, TagLabel, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import { AddMemberModal } from './AddMemberModal';
import { useContextSelector } from 'use-context-selector';
import ManageModal from './ManageModal';
import {
  CollaboratorContext,
  CollaboratorContextProvider,
  MemberManagerInputPropsType
} from './context';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';

function MemberManger() {
  const { t } = useTranslation();
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

  const { collaboratorList, isFetchingCollaborator } = useContextSelector(
    CollaboratorContext,
    (v) => v
  );

  return (
    <>
      <Flex alignItems="center" flexDirection="row" justifyContent="space-between" w="full">
        <Box>协作者</Box>
        <Flex flexDirection="row" gap="2">
          <Button
            size="sm"
            variant="whitePrimary"
            leftIcon={<MyIcon w="4" name="common/settingLight" />}
            onClick={onOpenManageModal}
          >
            {t('permission.Manage')}
          </Button>
          <Button
            size="sm"
            variant="whitePrimary"
            leftIcon={<MyIcon w="4" name="support/permission/collaborator" />}
            onClick={onOpenAddMember}
          >
            {t('common.Add')}
          </Button>
        </Flex>
      </Flex>

      {/* member list */}
      <MyBox
        isLoading={isFetchingCollaborator}
        mt={2}
        bg="myGray.100"
        borderRadius="md"
        size={'md'}
      >
        {collaboratorList?.length === 0 ? (
          <Box p={3} color="myGray.600" fontSize={'xs'} textAlign={'center'}>
            暂无协作者
          </Box>
        ) : (
          <Flex gap="2" p={1.5}>
            {collaboratorList?.map((member) => {
              return (
                <Tag px="4" py="1.5" bgColor="white" key={member.tmbId} width="fit-content">
                  <Flex alignItems="center">
                    <Avatar src={member.avatar} w="24px" />
                    <TagLabel mx="2">{member.name}</TagLabel>
                  </Flex>
                </Tag>
              );
            })}
          </Flex>
        )}
      </MyBox>
      {isOpenAddMember && <AddMemberModal onClose={onCloseAddMember} />}
      {isOpenManageModal && <ManageModal onClose={onCloseManageModal} />}
    </>
  );
}

function Render(props: MemberManagerInputPropsType) {
  return (
    <CollaboratorContextProvider {...props}>
      <MemberManger />
    </CollaboratorContextProvider>
  );
}

export default React.memo(Render);
