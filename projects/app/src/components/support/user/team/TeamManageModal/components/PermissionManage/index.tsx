import React, { useState } from 'react';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { delMemberPermission } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';

import { TeamModalContext } from '../../context';
import { TeamPermissionList } from '@fastgpt/global/support/permission/user/constant';
import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';

const AddMemberWithPermissionModal = dynamic(() => import('./AddMemberWithPermissionModal'));

function PermissionManage() {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { groups, refetchMembers, refetchGroups, isLoading, clbs, refetchClbs, members } =
    useContextSelector(TeamModalContext, (v) => v);

  const [addType, setAddType] = useState<'writer' | 'manager'>('writer');

  const {
    isOpen: isOpenAddManager,
    onOpen: onOpenAddManager,
    onClose: onCloseAddManager
  } = useDisclosure();

  const { runAsync: onRemovePermission, loading: isRemovingPermission } = useRequest2(
    delMemberPermission,
    {
      successToast: t('user:delete.success'),
      errorToast: t('user:delete.failed'),
      onSuccess: () => Promise.all([refetchMembers(), refetchGroups(), refetchClbs()])
    }
  );

  return <MyBox h={'100%'} isLoading={isRemovingPermission || isLoading} bg={'white'}></MyBox>;
}

export default PermissionManage;
