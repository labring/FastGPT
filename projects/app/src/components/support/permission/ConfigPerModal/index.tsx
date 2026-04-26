import React, { useCallback, useEffect, useRef, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import CollaboratorContextProvider, {
  CollaboratorContext,
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
import { PermissionEffectScopeEnum } from '@fastgpt/global/support/permission/constant';
import type {
  CollaboratorItemDetailType,
  CollaboratorItemType
} from '@fastgpt/global/support/permission/collaborator';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';
import MemberItemCard from '../MemberManager/MemberItemCard';
import { type RoleValueType } from '@fastgpt/global/support/permission/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export type ConfigPerModalProps = {
  avatar?: string;
  name: string;

  managePer: MemberManagerInputPropsType;
  isInheritPermission?: boolean;
  resumeInheritPermission?: () => void;
  hasParent?: boolean;
  refetchResource?: () => void;
  onChangeOwner?: (tmbId: string) => Promise<unknown>;

  // 生效范围
  showEffectScope?: boolean;
  effectScope?: PermissionEffectScopeEnum;

  // 确认回调：传入时使用新的"延迟提交"模式，点击确认才调用 API
  onConfirmPermission?: (props: {
    collaborators: CollaboratorItemType[];
    permissionEffectScope?: PermissionEffectScopeEnum;
  }) => Promise<void>;
};

// 内部组件：在 CollaboratorContext 内使用，负责 "添加" 按钮的同步逻辑
const AddMemberButton = ({ onAdd, label }: { onAdd: () => void; label: string }) => {
  const refetchCollaboratorList = useContextSelector(
    CollaboratorContext,
    (v) => v.refetchCollaboratorList
  );

  const handleClick = useCallback(() => {
    refetchCollaboratorList();
    onAdd();
  }, [refetchCollaboratorList, onAdd]);

  return (
    <Button
      size="sm"
      variant="whitePrimary"
      leftIcon={<MyIcon w="4" name="common/addLight" />}
      onClick={handleClick}
    >
      {label}
    </Button>
  );
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
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();

  const [localEffectScope, setLocalEffectScope] = useState(effectScope);
  const [localCollaborators, setLocalCollaborators] = useState<CollaboratorItemDetailType[] | null>(
    null
  );
  const localCollaboratorsRef = useRef<CollaboratorItemDetailType[]>([]);

  const {
    isOpen: isChangeOwnerModalOpen,
    onOpen: onOpenChangeOwnerModal,
    onClose: onCloseChangeOwnerModal
  } = useDisclosure();

  // 首次加载协作者列表
  useEffect(() => {
    if (feConfigs?.isPlus) {
      managePer.onGetCollaboratorList().then(({ clbs }) => {
        const details = clbs.map((c) => ({
          ...c,
          permission: new Permission({ role: c.permission.role })
        }));
        localCollaboratorsRef.current = details;
        setLocalCollaborators(details);
      });
    } else {
      setLocalCollaborators([]);
    }
  }, []);

  // 提供给 CollaboratorContextProvider 的本地 getter（使用 ref 保持最新状态）
  const localGetCollaboratorList = useCallback(async () => {
    return { clbs: localCollaboratorsRef.current, parentClbs: [] };
  }, []);

  // MemberModal 确认时，通过 onUpdateCollaboratorsDetail 更新本地状态
  const handleUpdateCollaboratorsDetail = useCallback((details: CollaboratorItemDetailType[]) => {
    const normalized = details.map((d) => ({
      ...d,
      permission: new Permission({ role: d.permission.role })
    }));
    localCollaboratorsRef.current = normalized;
    setLocalCollaborators(normalized);
  }, []);

  // 内联权限变更
  const handleRoleChange = useCallback((id: string, role: RoleValueType) => {
    setLocalCollaborators((prev) => {
      const updated = (prev ?? []).map((c) =>
        getCollaboratorId(c) === id ? { ...c, permission: new Permission({ role }) } : c
      );
      localCollaboratorsRef.current = updated;
      return updated;
    });
  }, []);

  // 内联删除
  const handleDelete = useCallback((id: string) => {
    setLocalCollaborators((prev) => {
      const updated = (prev ?? []).filter((c) => getCollaboratorId(c) !== id);
      localCollaboratorsRef.current = updated;
      return updated;
    });
  }, []);

  // 确认提交
  const { runAsync: handleConfirm, loading: isConfirming } = useRequest(
    async () => {
      const collaborators = (localCollaborators ?? []).map((c) => ({
        ...c,
        permission: c.permission.role
      })) as CollaboratorItemType[];

      if (onConfirmPermission) {
        await onConfirmPermission({
          collaborators,
          ...(showEffectScope && { permissionEffectScope: localEffectScope })
        });
      } else {
        await managePer.onUpdateCollaborators({ collaborators });
      }
    },
    {
      onSuccess: onClose,
      successToast: t('common:update_success'),
      errorToast: t('common:update_failed')
    }
  );

  const myRole = new Permission({ role: managePer.permission.role });

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        title={t('common:permission.Permission config')}
        isLoading={localCollaborators === null}
      >
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
              <Box fontSize={'sm'} fontWeight={'medium'} mb={2}>
                {t('common:permission.Effect scope')}
              </Box>
              <RadioGroup
                value={localEffectScope}
                onChange={(val) => setLocalEffectScope(val as PermissionEffectScopeEnum)}
              >
                <Stack spacing={2}>
                  <Radio value={PermissionEffectScopeEnum.allChildren}>
                    <Box>
                      <Box fontSize={'sm'}>{t('common:permission.All children scope')}</Box>
                      <Box fontSize={'xs'} color={'myGray.500'}>
                        {t('common:permission.All children scope desc')}
                      </Box>
                    </Box>
                  </Radio>
                  <Radio value={PermissionEffectScopeEnum.currentOnly}>
                    <Box>
                      <Box fontSize={'sm'}>{t('common:permission.Current only scope')}</Box>
                      <Box fontSize={'xs'} color={'myGray.500'}>
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
            <CollaboratorContextProvider
              {...managePer}
              onGetCollaboratorList={localGetCollaboratorList}
              onUpdateCollaborators={async () => {}}
              onUpdateCollaboratorsDetail={handleUpdateCollaboratorsDetail}
              refreshDeps={[]}
            >
              {({ onOpenManageModal }) => (
                <>
                  {/* 标题栏 */}
                  <Flex alignItems="center" justifyContent="space-between" w="full" mb={2}>
                    <Box fontSize={'sm'}>{t('common:permission.Collaborator')}</Box>
                    <Flex gap={2}>
                      {onChangeOwner && (
                        <Button
                          size="sm"
                          variant="whitePrimary"
                          leftIcon={<MyIcon w="4" name="common/lineChange" />}
                          onClick={onOpenChangeOwnerModal}
                        >
                          {t('common:permission.change_owner')}
                        </Button>
                      )}
                      <AddMemberButton label={t('common:Add')} onAdd={onOpenManageModal} />
                    </Flex>
                  </Flex>

                  {/* 协作者列表 */}
                  <Box
                    border="1px solid"
                    borderColor="myGray.200"
                    borderRadius="md"
                    overflow="hidden"
                  >
                    {/* 表头：px/gap 与 MemberItemCard 一致 */}
                    <Flex
                      px="1"
                      py={1.5}
                      gap="2"
                      alignItems="center"
                      bg="myGray.50"
                      borderBottom="1px solid"
                      borderColor="myGray.200"
                      fontSize={'xs'}
                      color={'myGray.600'}
                      fontWeight={'medium'}
                    >
                      <Box flex="1" pl={1}>
                        {t('common:name')}
                      </Box>
                      <Box w="120px">{t('common:permission.Permission')}</Box>
                      <Box w="36px" textAlign="center">
                        {t('common:Operation')}
                      </Box>
                    </Flex>

                    {(localCollaborators ?? []).length === 0 ? (
                      <Box p={4} color="myGray.500" fontSize={'sm'} textAlign={'center'}>
                        {t('common:permission.Not collaborator')}
                      </Box>
                    ) : (
                      (localCollaborators ?? []).map((clb, index) => {
                        const id = getCollaboratorId(clb);
                        const isOwner = clb.permission.isOwner;
                        const isSelf = clb.tmbId === userInfo?.team?.tmbId;
                        const isDisabled =
                          isOwner || isSelf || (clb.permission.hasManagePer && !myRole.isOwner);
                        return (
                          <Box
                            key={id}
                            borderTop={index > 0 ? '1px solid' : 'none'}
                            borderColor="myGray.100"
                          >
                            <MemberItemCard
                              avatar={clb.avatar}
                              name={clb.name ?? ''}
                              role={clb.permission.role}
                              roleSelectWidth="120px"
                              onRoleChange={(role) => handleRoleChange(id, role)}
                              onDelete={() => handleDelete(id)}
                              disabled={isDisabled}
                            />
                          </Box>
                        );
                      })
                    )}
                  </Box>
                </>
              )}
            </CollaboratorContextProvider>
          </Box>
        </ModalBody>

        <ModalFooter>
          <Button variant="whiteBase" mr={2} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={isConfirming} onClick={handleConfirm}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
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
