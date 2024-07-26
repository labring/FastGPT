import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import CollaboratorContextProvider, { MemberManagerInputPropsType } from '../MemberManager/context';
import { Box, Button, Flex, HStack, ModalBody } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import DefaultPermissionList from '../DefaultPerList';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useI18n } from '@/web/context/I18n';
import ResumeInherit from '../ResumeInheritText';

export type ConfigPerModalProps = {
  avatar?: string;
  name: string;

  defaultPer: {
    value: PermissionValueType;
    defaultValue: PermissionValueType;
    onChange: (v: PermissionValueType) => Promise<any>;
  };
  managePer: MemberManagerInputPropsType;
  isInheritPermission?: boolean;
  resumeInheritPermission?: () => void;
  hasParent?: boolean;
  refetchResource?: () => void;
};

const ConfigPerModal = ({
  avatar,
  name,
  defaultPer,
  managePer,
  isInheritPermission,
  resumeInheritPermission,
  hasParent,
  onClose,
  refetchResource
}: ConfigPerModalProps & {
  onClose: () => void;
}) => {
  const { t } = useTranslation();

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
          <Box mt={5}>
            <Box fontSize={'sm'}>{t('common:permission.Default permission')}</Box>
            <DefaultPermissionList
              mt="1"
              per={defaultPer.value}
              defaultPer={defaultPer.defaultValue}
              isInheritPermission={isInheritPermission}
              onChange={(v) => defaultPer.onChange(v)}
              hasParent={hasParent}
            />
          </Box>
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
        </ModalBody>
      </MyModal>
    </>
  );
};

export default ConfigPerModal;
