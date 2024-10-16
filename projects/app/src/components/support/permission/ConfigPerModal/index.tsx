import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import CollaboratorContextProvider, { MemberManagerInputPropsType } from '../MemberManager/context';
import { Box, Button, Flex, HStack, ModalBody, useDisclosure } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ResumeInherit from '../ResumeInheritText';
import { ChangeOwnerModal } from '../ChangeOwnerModal';

export type ConfigPerModalProps = {
  avatar?: string;
  name: string;

  managePer: MemberManagerInputPropsType;
  isInheritPermission?: boolean;
  resumeInheritPermission?: () => void;
  hasParent?: boolean;
  refetchResource?: () => void;
  onChangeOwner?: (tmbId: string) => Promise<unknown>;
};

const ConfigPerModal = ({
  avatar,
  name,
  managePer,
  isInheritPermission,
  resumeInheritPermission,
  hasParent,
  onClose,
  refetchResource,
  onChangeOwner
}: ConfigPerModalProps & {
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const {
    isOpen: isChangeOwnerModalOpen,
    onOpen: onOpenChangeOwnerModal,
    onClose: onCloseChangeOwnerModal
  } = useDisclosure();

  return (
    <>
      <MyModal
        isOpen
        iconSrc="/imgs/modal/key.svg"
        onClose={onClose}
        title={t('common:permission.Permission config')}
      >
        <ModalBody>
          <HStack>
            <Avatar src={avatar} w={'1.75rem'} borderRadius={'md'} />
            <Box>{name}</Box>
          </HStack>
          {!isInheritPermission && (
            <Box mt={3}>
              <ResumeInherit onResume={resumeInheritPermission} />
            </Box>
          )}
          <Box mt={4}>
            <CollaboratorContextProvider
              {...managePer}
              refetchResource={refetchResource}
              isInheritPermission={isInheritPermission}
              hasParent={hasParent}
            >
              {({ MemberListCard, onOpenManageModal, onOpenAddMember }) => {
                return (
                  <>
                    <Flex
                      alignItems="center"
                      flexDirection="row"
                      justifyContent="space-between"
                      w="full"
                    >
                      <Box fontSize={'sm'}>{t('common:permission.Collaborator')}</Box>
                      <Flex flexDirection="row" gap="2">
                        <Button
                          size="sm"
                          variant="whitePrimary"
                          leftIcon={<MyIcon w="4" name="common/settingLight" />}
                          onClick={onOpenManageModal}
                        >
                          {t('common:permission.Manage')}
                        </Button>
                        <Button
                          size="sm"
                          variant="whitePrimary"
                          leftIcon={<MyIcon w="4" name="support/permission/collaborator" />}
                          onClick={onOpenAddMember}
                        >
                          {t('common:common.Add')}
                        </Button>
                      </Flex>
                    </Flex>
                    <MemberListCard mt={2} p={1.5} bg="myGray.100" borderRadius="md" />
                  </>
                );
              }}
            </CollaboratorContextProvider>
          </Box>
          {onChangeOwner && (
            <Box mt={4}>
              <Button
                size="md"
                variant="whitePrimary"
                onClick={onOpenChangeOwnerModal}
                w="full"
                borderRadius="md"
                leftIcon={<MyIcon w="4" name="common/lineChange" />}
              >
                {t('common:permission.change_owner')}
              </Button>
            </Box>
          )}
        </ModalBody>
      </MyModal>
      {isChangeOwnerModalOpen && onChangeOwner && (
        <ChangeOwnerModal
          onClose={onCloseChangeOwnerModal}
          avatar={avatar}
          name={name}
          onChangeOwner={onChangeOwner}
        />
      )}
    </>
  );
};

export default ConfigPerModal;
