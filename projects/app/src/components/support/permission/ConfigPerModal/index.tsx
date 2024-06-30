import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import CollaboratorContextProvider, { MemberManagerInputPropsType } from '../MemberManager/context';
import { Box, Button, Flex, HStack, ModalBody } from '@chakra-ui/react';
import Avatar from '@/components/Avatar';
import DefaultPermissionList from '../DefaultPerList';
import MyIcon from '@fastgpt/web/components/common/Icon';

export type ConfigPerModalProps = {
  avatar?: string;
  name: string;

  defaultPer: {
    value: PermissionValueType;
    defaultValue: PermissionValueType;
    onChange: (v: PermissionValueType) => Promise<any>;
  };
  managePer: MemberManagerInputPropsType;
};

const ConfigPerModal = ({
  avatar,
  name,
  defaultPer,
  managePer,
  onClose
}: ConfigPerModalProps & {
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <MyModal
      isOpen
      iconSrc="/imgs/modal/key.svg"
      onClose={onClose}
      title={t('permission.Permission config')}
    >
      <ModalBody>
        <HStack>
          <Avatar src={avatar} w={'1.75rem'} />
          <Box>{name}</Box>
        </HStack>
        <Box mt={6}>
          <Box fontSize={'sm'}>{t('permission.Default permission')}</Box>
          <DefaultPermissionList
            mt="1"
            per={defaultPer.value}
            defaultPer={defaultPer.defaultValue}
            onChange={defaultPer.onChange}
          />
        </Box>
        <Box mt={4}>
          <CollaboratorContextProvider {...managePer}>
            {({ MemberListCard, onOpenManageModal, onOpenAddMember }) => {
              return (
                <>
                  <Flex
                    alignItems="center"
                    flexDirection="row"
                    justifyContent="space-between"
                    w="full"
                  >
                    <Box fontSize={'sm'}>{t('permission.Collaborator')}</Box>
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
                  <MemberListCard mt={2} p={1.5} bg="myGray.100" borderRadius="md" />
                </>
              );
            }}
          </CollaboratorContextProvider>
        </Box>
      </ModalBody>
    </MyModal>
  );
};

export default ConfigPerModal;
