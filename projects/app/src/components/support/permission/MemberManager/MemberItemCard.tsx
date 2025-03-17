import React from 'react';
import { Box, Checkbox, HStack, VStack } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import PermissionTags from './PermissionTags';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import OrgTags from '../../user/team/OrgTags';

function MemberItemCard({
  avatar,
  key,
  onChange,
  isChecked,
  onDelete,
  name,
  permission,
  orgs
}: {
  avatar: string;
  key: string;
  onChange: () => void;
  isChecked?: boolean;
  onDelete?: () => void;
  name: string;
  permission?: PermissionValueType;
  orgs?: string[];
}) {
  return (
    <>
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
        {isChecked !== undefined && <Checkbox isChecked={isChecked} pointerEvents="none" />}
        <Avatar src={avatar} w="1.5rem" borderRadius={'50%'} />

        <Box w="full">
          <Box fontSize={'sm'}>{name}</Box>
          <Box lineHeight={1}>{orgs && orgs.length > 0 && <OrgTags orgs={orgs} />}</Box>
        </Box>
        {permission && <PermissionTags permission={permission} />}
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
      </HStack>
    </>
  );
}

export default MemberItemCard;
