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
import type { OrgType } from '@fastgpt/global/support/user/team/org/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import MemberTag from '@/components/support/user/team/Info/MemberTag';
import { TeamContext } from '../context';
import { deleteOrg, deleteOrgMember, getOrgList } from '@/web/support/user/team/org/api';

import IconButton from './IconButton';
import { defaultOrgForm, type OrgFormType } from './OrgInfoModal';

import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';
import Path from '@/components/common/folder/Path';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import { useSystemStore } from '@/web/common/system/useSystemStore';

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

  const { members, MemberScrollData } = useContextSelector(TeamContext, (v) => v);
  const { feConfigs } = useSystemStore();

  const isSyncMember = feConfigs.register_method?.includes('sync');
  const [parentPath, setParentPath] = useState('');
  const {
    data: orgs = [],
    loading: isLoadingOrgs,
    refresh: refetchOrgs
  } = useRequest2(getOrgList, {
    manual: false,
    refreshDeps: [userInfo?.team?.teamId]
  });
  const currentOrgs = useMemo(() => {
    if (orgs.length === 0) return [];
    // Auto select the first org(root org is team)
    if (parentPath === '') {
      setParentPath(getOrgChildrenPath(orgs[0]));
      return [];
    }

    return orgs
      .filter((org) => org.path === parentPath)
      .map((item) => {
        return {
          ...item,
          // Member + org
          count:
            item.members.length + orgs.filter((org) => org.path === getOrgChildrenPath(item)).length
        };
      });
  }, [orgs, parentPath]);
  const currentOrg = useMemo(() => {
    const splitPath = parentPath.split('/');
    const currentOrgId = splitPath[splitPath.length - 1];
    if (!currentOrgId) return;

    return orgs.find((org) => org.pathId === currentOrgId);
  }, [orgs, parentPath]);

  const paths = useMemo(() => {
    const splitPath = parentPath.split('/').filter(Boolean);
    return splitPath
      .map((id) => {
        const org = orgs.find((org) => org.pathId === id)!;

        if (org.path === '') return;

        return {
          parentId: getOrgChildrenPath(org),
          parentName: org.name
        };
      })
      .filter(Boolean) as ParentTreePathItemType[];
  }, [parentPath, orgs]);

  const [editOrg, setEditOrg] = useState<OrgFormType>();
  const [manageMemberOrg, setManageMemberOrg] = useState<OrgType>();
  const [movingOrg, setMovingOrg] = useState<OrgType>();

  // Delete org
  const { ConfirmModal: ConfirmDeleteOrgModal, openConfirm: openDeleteOrgModal } = useConfirm({
    type: 'delete',
    content: t('account_team:confirm_delete_org')
  });
  const deleteOrgHandler = (orgId: string) => openDeleteOrgModal(() => deleteOrgReq(orgId))();
  const { runAsync: deleteOrgReq } = useRequest2(deleteOrg, {
    onSuccess: () => {
      refetchOrgs();
    }
  });

  // Delete member
  const { ConfirmModal: ConfirmDeleteMember, openConfirm: openDeleteMemberModal } = useConfirm({
    type: 'delete',
    content: t('account_team:confirm_delete_member')
  });
  const { runAsync: deleteMemberReq } = useRequest2(deleteOrgMember, {
    onSuccess: () => {
      refetchOrgs();
    }
  });

  return (
    <>
      <Flex justify={'space-between'} align={'center'} pb={'1rem'}>
        {Tabs}
      </Flex>
      <MyBox
        flex={'1 0 0'}
        h={0}
        display={'flex'}
        flexDirection={'column'}
        isLoading={isLoadingOrgs}
      >
        <Box mb={3}>
          <Path paths={paths} rootName={userInfo?.team?.teamName} onClick={setParentPath} />
        </Box>
        <Flex flex={'1 0 0'} h={0} w={'100%'} gap={'4'}>
          <MemberScrollData h={'100%'} fontSize={'sm'} flexGrow={1}>
            {/* Table */}
            <TableContainer>
              <Table>
                <Thead>
                  <Tr bg={'white !important'}>
                    <Th bg="myGray.100" borderLeftRadius="6px">
                      {t('common:Name')}
                    </Th>
                    {!isSyncMember && (
                      <Th bg="myGray.100" borderRightRadius="6px">
                        {t('common:common.Action')}
                      </Th>
                    )}
                  </Tr>
                </Thead>
                <Tbody>
                  {currentOrgs.map((org) => (
                    <Tr key={org._id} overflow={'unset'}>
                      <Td>
                        <HStack
                          cursor={'pointer'}
                          onClick={() => setParentPath(getOrgChildrenPath(org))}
                        >
                          <MemberTag name={org.name} avatar={org.avatar} />
                          <Tag size="sm">{org.count}</Tag>
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
                  {currentOrg?.members.map((member) => {
                    const memberInfo = members.find((m) => m.tmbId === member.tmbId);
                    if (!memberInfo) return null;

                    return (
                      <Tr key={member.tmbId}>
                        <Td>
                          <MemberTag name={memberInfo.memberName} avatar={memberInfo.avatar} />
                        </Td>
                        <Td w={'6rem'}>
                          {isTeamAdmin && !isSyncMember && (
                            <MyMenu
                              trigger={'hover'}
                              Button={<IconButton name="more" />}
                              menuList={[
                                {
                                  children: [
                                    {
                                      icon: 'delete',
                                      label: t('account_team:delete'),
                                      type: 'danger',
                                      onClick: () =>
                                        openDeleteMemberModal(() =>
                                          deleteMemberReq(currentOrg._id, member.tmbId)
                                        )()
                                    }
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
                <Avatar src={currentOrg?.avatar} w={'1rem'} h={'1rem'} rounded={'xs'} />
                <Box fontWeight={500} color={'myGray.900'}>
                  {currentOrg?.name}
                </Box>
                {currentOrg?.path !== '' && (
                  <IconButton name="edit" onClick={() => setEditOrg(currentOrg)} />
                )}
              </HStack>
              <Box fontSize={'xs'}>{currentOrg?.description || t('common:common.no_intro')}</Box>

              <Divider my={'20px'} />

              <Box fontWeight={500} fontSize="sm" color="myGray.900">
                {t('common:common.Action')}
              </Box>
              {currentOrg && isTeamAdmin && (
                <VStack gap="13px" w="100%">
                  <ActionButton
                    icon="common/add2"
                    text={t('account_team:create_sub_org')}
                    onClick={() => {
                      setEditOrg({
                        ...defaultOrgForm,
                        parentId: currentOrg?._id
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
          onSuccess={refetchOrgs}
        />
      )}
      {!!movingOrg && (
        <OrgMoveModal
          orgs={orgs}
          movingOrg={movingOrg}
          onClose={() => setMovingOrg(undefined)}
          onSuccess={refetchOrgs}
        />
      )}
      {!!manageMemberOrg && (
        <OrgMemberManageModal
          currentOrg={manageMemberOrg}
          refetchOrgs={refetchOrgs}
          onClose={() => setManageMemberOrg(undefined)}
        />
      )}

      <ConfirmDeleteOrgModal />
      <ConfirmDeleteMember />
    </>
  );
}

export default OrgTable;
