import React, { useState, useEffect } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import CollaboratorContextProvider, {
  type MemberManagerInputPropsType
} from '../MemberManager/context';
import {
  Box,
  Button,
  Flex,
  HStack,
  ModalBody,
  ModalFooter,
  Radio,
  RadioGroup,
  Stack,
  useDisclosure
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ResumeInherit from '../ResumeInheritText';
import { ChangeOwnerModal } from '../ChangeOwnerModal';
import type {
  CollaboratorItemDetailType,
  CollaboratorItemType
} from '@fastgpt/global/support/permission/collaborator';
import { PermissionEffectScopeEnum } from '@fastgpt/global/support/permission/constant';

export type ConfigPerModalProps = {
  avatar?: string;
  name: string;

  managePer: MemberManagerInputPropsType;
  isInheritPermission?: boolean;
  resumeInheritPermission?: () => void;
  hasParent?: boolean;
  refetchResource?: () => void;
  onChangeOwner?: (tmbId: string) => Promise<unknown>;
  showEffectScope?: boolean;
  effectScope?: PermissionEffectScopeEnum;
  onConfirmPermission?: (props: {
    collaborators: CollaboratorItemType[];
    permissionEffectScope?: PermissionEffectScopeEnum;
  }) => Promise<void>;
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
  onChangeOwner,
  showEffectScope,
  effectScope = PermissionEffectScopeEnum.allChildren,
  onConfirmPermission
}: ConfigPerModalProps & {
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const {
    isOpen: isChangeOwnerModalOpen,
    onOpen: onOpenChangeOwnerModal,
    onClose: onCloseChangeOwnerModal
  } = useDisclosure();

  const [localEffectScope, setLocalEffectScope] = useState<PermissionEffectScopeEnum | undefined>(
    effectScope
  );
  useEffect(() => {
    setLocalEffectScope(effectScope);
  }, [effectScope]);

  return (
    <>
      <MyModal isOpen onClose={onClose} title={t('common:permission.Permission config')}>
        <CollaboratorContextProvider
          {...managePer}
          refetchResource={refetchResource}
          isInheritPermission={isInheritPermission}
          hasParent={hasParent}
        >
          {({ MemberListCard, onOpenManageModal, collaboratorList }) => (
            <>
              <ModalBody>
                {/* 资源信息 */}
                <HStack>
                  <Avatar src={avatar} w={'1.75rem'} borderRadius={'md'} />
                  <Box>{name}</Box>
                </HStack>

                {/* 继承权限提示 */}
                {!isInheritPermission && hasParent && (
                  <Box mt={3}>
                    <ResumeInherit onResume={resumeInheritPermission} />
                  </Box>
                )}

                {/* 生效范围 */}
                {showEffectScope && (
                  <Box mt={4}>
                    <Box fontSize={'12px'} fontWeight={'medium'} mb={2} color={'myWhite.1000'}>
                      {t('common:permission.Effect scope')}
                    </Box>
                    <RadioGroup
                      value={localEffectScope}
                      onChange={(val) => setLocalEffectScope(val as PermissionEffectScopeEnum)}
                    >
                      <Stack spacing={1}>
                        <Radio value={PermissionEffectScopeEnum.allChildren}>
                          <Box fontSize={'12px'} py={2}>
                            <Box as="span" fontWeight={500} color={'#111824'}>
                              {t('common:permission.All children scope')}
                            </Box>
                            <Box as="span" color={'#666666'}>
                              {t('common:permission.All children scope desc')}
                            </Box>
                          </Box>
                        </Radio>
                        <Radio value={PermissionEffectScopeEnum.currentOnly}>
                          <Box fontSize={'12px'} py={2}>
                            <Box as="span" fontWeight={500} color={'#111824'}>
                              {t('common:permission.Current only scope')}
                            </Box>
                            <Box as="span" color={'#666666'}>
                              {t('common:permission.Current only scope desc')}
                            </Box>
                          </Box>
                        </Radio>
                      </Stack>
                    </RadioGroup>
                  </Box>
                )}

                {/* 协作者管理 */}
                <Box mt={4}>
                  <Flex
                    alignItems="center"
                    flexDirection="row"
                    justifyContent="space-between"
                    w="full"
                  >
                    <Box fontSize={'xs'}>{t('common:permission.Collaborator')}</Box>
                    <HStack spacing={2}>
                      {onChangeOwner && (
                        <Button size="xs" variant="whitePrimary" onClick={onOpenChangeOwnerModal}>
                          {t('common:permission.change_owner')}
                        </Button>
                      )}
                      <Button size="xs" variant="whitePrimary" onClick={onOpenManageModal}>
                        {t('common:permission.Manage')}
                      </Button>
                    </HStack>
                  </Flex>
                  <MemberListCard mt={2} p={1.5} bg="myGray.100" borderRadius="md" />
                </Box>
              </ModalBody>

              <ModalFooter>
                {onConfirmPermission ? (
                  <HStack spacing={3}>
                    <Button variant="whiteBase" onClick={onClose}>
                      {t('common:Cancel')}
                    </Button>
                    <Button
                      onClick={() => {
                        const collaborators = collaboratorList.map((clb) => ({
                          ...clb,
                          permission: clb.permission.role
                        })) as CollaboratorItemType[];
                        onConfirmPermission({
                          collaborators,
                          permissionEffectScope: localEffectScope
                        }).then(() => onClose());
                      }}
                    >
                      {t('common:Confirm')}
                    </Button>
                  </HStack>
                ) : (
                  <Button variant="whiteBase" onClick={onClose}>
                    {t('common:Close')}
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </CollaboratorContextProvider>
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
