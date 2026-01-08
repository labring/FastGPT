import { useUserStore } from '@/web/support/user/useUserStore';
import {
  Box,
  Divider,
  Flex,
  HStack,
  Table,
  TableContainer,
  Tag,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  VStack
} from '@chakra-ui/react';
import type { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import MemberTag from '@/components/support/user/team/Info/MemberTag';
import { deleteOrg, deleteOrgMember } from '@/web/support/user/team/org/api';

import IconButton from './IconButton';
import { defaultOrgForm, type OrgFormType } from './OrgInfoModal';

import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';
import Path from '@/components/common/folder/Path';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { delRemoveMember } from '@/web/support/user/team/api';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import useOrg from '@/web/support/user/team/org/hooks/useOrg';

const OrgInfoModal = dynamic(() => import('./OrgInfoModal'));
const OrgMemberManageModal = dynamic(() => import('./OrgMemberManageModal'));
const OrgMoveModal = dynamic(() => import('./OrgMoveModal'));

function ActionButton({
  icon,
  text,
  onClick
}: {
  icon: IconNameType;
  text: string;
  onClick: () => void;
}) {
  return (
    <HStack
      gap={'8px'}
      w="100%"
      transition={'background 0.1s'}
      cursor={'pointer'}
      p="4px"
      rounded={'sm'}
      _hover={{
        bg: 'myGray.05',
        color: 'primary.600'
      }}
      onClick={onClick}
    >
      <MyIcon name={icon} w="1rem" h="1rem" />
      <Box fontSize={'sm'}>{text}</Box>
    </HStack>
  );
}

function OrgTable({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useTranslation();
  const { userInfo, isTeamAdmin } = useUserStore();
  const { feConfigs } = useSystemStore();
  const isSyncMember = feConfigs.register_method?.includes('sync');
  const [editOrg, setEditOrg] = useState<OrgFormType>();
  const [manageMemberOrg, setManageMemberOrg] = useState<OrgListItemType>();
  const [movingOrg, setMovingOrg] = useState<OrgListItemType>();
  const {
    currentOrg,
    orgs,
    isLoading,
    paths,
    onClickOrg,
    members,
    MemberScrollData,
    onPathClick,
    refresh,
    updateCurrentOrg,
    setSearchKey,
    searchKey
  } = useOrg();

  // Delete org
  const { ConfirmModal: ConfirmDeleteOrgModal, openConfirm: openDeleteOrgModal } = useConfirm({
    type: 'delete',
    content: t('account_team:confirm_delete_org')
  });
  const deleteOrgHandler = (orgId: string) =>
    openDeleteOrgModal({ onConfirm: () => deleteOrgReq(orgId) })();
  const { runAsync: deleteOrgReq } = useRequest2(deleteOrg, {
    onSuccess: refresh
  });

  // Delete member
  const { ConfirmModal: ConfirmDeleteMemberFromOrg, openConfirm: openDeleteMemberFromOrgModal } =
    useConfirm({
      type: 'delete'
    });

  const { ConfirmModal: ConfirmDeleteMemberFromTeam, openConfirm: openDeleteMemberFromTeamModal } =
    useConfirm({
      type: 'delete'
    });

  const { runAsync: deleteMemberReq } = useRequest2(deleteOrgMember, {
    onSuccess: refresh
  });

  const { runAsync: deleteMemberFromTeamReq } = useRequest2(delRemoveMember, {
    onSuccess: refresh
  });

  return (
    <>
      <Flex justify={'space-between'} align={'center'} pb={'1rem'}>
        {Tabs}
        <Box w="200px">
          <SearchInput
            placeholder={t('account_team:search_org')}
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
          />
        </Box>
      </Flex>
      <MyBox flex={'1 0 0'} h={0} display={'flex'} flexDirection={'column'}>
        <Box mb={3}>
          {!searchKey && (
            <Path paths={paths} rootName={userInfo?.team?.teamName} onClick={onPathClick} />
          )}
        </Box>
        <Flex flex={'1 0 0'} h={0} w={'100%'} gap={'4'}>
          <MemberScrollData flex="1" isLoading={isLoading}>
            <TableContainer>
              <Table>
                <Thead>
                  <Tr bg={'white !important'}>
                    <Th bg="myGray.100" borderLeftRadius="6px">
                      {t('common:Name')}
                    </Th>
                    <Th bg="myGray.100" borderRightRadius="6px">
                      {t('common:Action')}
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {orgs
                    .filter((org) => org.path !== '')
                    .map((org) => (
                      <Tr key={org._id} overflow={'unset'}>
                        <Td>
                          <HStack cursor={'pointer'} onClick={() => onClickOrg(org)}>
                            <MemberTag name={org.name} avatar={org.avatar} />
                            <Tag size="sm">{org.total}</Tag>
                            <MyIcon
                              name="core/chat/chevronRight"
                              w={'1rem'}
                              h={'1rem'}
                              color={'myGray.500'}
                            />
                          </HStack>
                        </Td>
                        {isTeamAdmin && !isSyncMember && (
                          <Td w={'6rem'}>
                            <MyMenu
                              trigger="hover"
                              Button={<IconButton name="more" />}
                              menuList={[
                                {
                                  children: [
                                    {
                                      icon: 'edit',
                                      label: t('account_team:edit_info'),
                                      onClick: () => setEditOrg(org)
                                    },
                                    {
                                      icon: 'common/file/move',
                                      label: t('common:Move'),
                                      onClick: () => setMovingOrg(org)
                                    },
                                    {
                                      icon: 'delete',
                                      label: t('account_team:delete'),
                                      type: 'danger',
                                      onClick: () => deleteOrgHandler(org._id)
                                    }
                                  ]
                                }
                              ]}
                            />
                          </Td>
                        )}
                      </Tr>
                    ))}
                  {!searchKey &&
                    members.map((member) => {
                      return (
                        <Tr key={member.tmbId}>
                          <Td>
                            <MemberTag name={member.memberName} avatar={member.avatar} />
                          </Td>
                          <Td w={'6rem'}>
                            {isTeamAdmin && (
                              <MyMenu
                                trigger={'hover'}
                                Button={<IconButton name="more" />}
                                menuList={[
                                  {
                                    children: [
                                      {
                                        menuItemStyles: {
                                          _hover: {
                                            color: 'red.600',
                                            backgroundColor: 'red.50'
                                          }
                                        },
                                        label: t('account_team:delete_from_team', {
                                          username: member.memberName
                                        }),
                                        onClick: () => {
                                          openDeleteMemberFromTeamModal({
                                            onConfirm: () => deleteMemberFromTeamReq(member.tmbId),
                                            customContent: t(
                                              'account_team:confirm_delete_from_team',
                                              {
                                                username: member.memberName
                                              }
                                            )
                                          })();
                                        }
                                      },
                                      ...(isSyncMember
                                        ? []
                                        : [
                                            {
                                              menuItemStyles: {
                                                _hover: {
                                                  color: 'red.600',
                                                  bgColor: 'red.50'
                                                }
                                              },
                                              label: t('account_team:delete_from_org'),
                                              onClick: () =>
                                                openDeleteMemberFromOrgModal({
                                                  onConfirm: () => {
                                                    if (currentOrg) {
                                                      return deleteMemberReq(
                                                        currentOrg._id,
                                                        member.tmbId
                                                      );
                                                    }
                                                  },
                                                  customContent: t(
                                                    'account_team:confirm_delete_from_org',
                                                    {
                                                      username: member.memberName
                                                    }
                                                  )
                                                })()
                                            }
                                          ])
                                    ]
                                  }
                                ]}
                              />
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                </Tbody>
              </Table>
            </TableContainer>
          </MemberScrollData>

          {/* Slider */}
          {!isSyncMember && (
            <VStack w={'180px'} alignItems={'start'}>
              <HStack gap={'6px'}>
                <Avatar src={currentOrg.avatar} w={'1rem'} h={'1rem'} rounded={'xs'} />
                <Box
                  title={currentOrg.name}
                  fontWeight={500}
                  color={'myGray.900'}
                  className="textEllipsis3"
                >
                  {currentOrg.name}
                </Box>
                {currentOrg?.path !== '' && (
                  <IconButton name="edit" onClick={() => setEditOrg(currentOrg)} />
                )}
              </HStack>
              {currentOrg?.path !== '' && (
                <Box fontSize={'xs'}>{currentOrg?.description || t('common:no_intro')}</Box>
              )}

              <Divider my={'20px'} />

              <Box fontWeight={500} fontSize="sm" color="myGray.900">
                {t('common:Action')}
              </Box>
              {isTeamAdmin && (
                <VStack gap="13px" w="100%">
                  <ActionButton
                    icon="common/add2"
                    text={t('account_team:create_sub_org')}
                    onClick={() => {
                      setEditOrg({
                        ...defaultOrgForm,
                        path: currentOrg.path
                      });
                    }}
                  />
                  <ActionButton
                    icon="common/administrator"
                    text={t('account_team:manage_member')}
                    onClick={() => setManageMemberOrg(currentOrg)}
                  />
                  {currentOrg?.path !== '' && (
                    <>
                      <ActionButton
                        icon="common/file/move"
                        text={t('account_team:move_org')}
                        onClick={() => setMovingOrg(currentOrg)}
                      />
                      <ActionButton
                        icon="delete"
                        text={t('account_team:delete_org')}
                        onClick={() => deleteOrgHandler(currentOrg._id)}
                      />
                    </>
                  )}
                </VStack>
              )}
            </VStack>
          )}
        </Flex>
      </MyBox>

      {!!editOrg && (
        <OrgInfoModal
          editOrg={editOrg}
          onClose={() => setEditOrg(undefined)}
          onSuccess={refresh}
          updateCurrentOrg={updateCurrentOrg}
          parentId={currentOrg._id}
        />
      )}
      {!!movingOrg && (
        <OrgMoveModal
          movingOrg={movingOrg}
          onClose={() => setMovingOrg(undefined)}
          onSuccess={refresh}
        />
      )}
      {!!manageMemberOrg && (
        <OrgMemberManageModal
          currentOrg={manageMemberOrg}
          refetchOrgs={refresh}
          onClose={() => setManageMemberOrg(undefined)}
        />
      )}

      <ConfirmDeleteOrgModal />
      <ConfirmDeleteMemberFromOrg />
      <ConfirmDeleteMemberFromTeam />
    </>
  );
}

export default OrgTable;
