import React from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Checkbox, HStack, VStack } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import PermissionTags from './PermissionTags';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import OrgTags from '../../user/team/OrgTags';
import Tag from '@fastgpt/web/components/common/Tag';

function MemberItemCard({
  avatar,
  key,
  onChange: _onChange,
  isChecked,
  onDelete,
  name,
  permission,
  orgs,
  addOnly,
  rightSlot
}: {
  avatar: string;
  key: string;
  onChange: () => void;
  isChecked?: boolean;
  onDelete?: () => void;
  name: string;
  permission?: PermissionValueType;
  addOnly?: boolean;
  orgs?: string[];
  rightSlot?: React.ReactNode;
}) {
  const isAdded = addOnly && !!permission;
  const onChange = () => {
    if (!isAdded) _onChange();
  };
  const { t } = useTranslation();
  return (
    <HStack
      justifyContent="space-between"
      alignItems="center"
      key={key}
      px="3"
      py="2"
      borderRadius="sm"
      _hover={{
        bgColor: 'myGray.50',
        cursor: 'pointer'
      }}
      onClick={onChange}
    >
      {isChecked !== undefined && (
        <Checkbox isChecked={isChecked} pointerEvents="none" disabled={isAdded} />
      )}
      <Avatar src={avatar} w="1.5rem" borderRadius={'50%'} />

      <Box w="full">
        <Box fontSize={'sm'} className="textEllipsis" maxW="300px">
          {name}
        </Box>
        <Box lineHeight={1}>{orgs && orgs.length > 0 && <OrgTags orgs={orgs} />}</Box>
      </Box>
      {!isAdded && permission && <PermissionTags permission={permission} />}
      {isAdded && (
        <Tag
          mixBlendMode={'multiply'}
          colorSchema="blue"
          border="none"
          py={2}
          px={3}
          fontSize={'xs'}
        >
          {t('user:team.collaborator.added')}
        </Tag>
      )}
      {onDelete !== undefined && (
        <MyIcon
          name="common/closeLight"
          w="1rem"
          cursor={'pointer'}
          _hover={{
            color: 'red.600'
          }}
          onClick={onDelete}
        />
      )}
      {rightSlot}
    </HStack>
  );
}

export default MemberItemCard;
