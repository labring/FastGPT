import React from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Checkbox, Flex, HStack, VStack } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import RoleTags from './RoleTags';
import type { RoleValueType } from '@fastgpt/global/support/permission/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import OrgTags from '../../user/team/OrgTags';
import Tag from '@fastgpt/web/components/common/Tag';
import RoleSelect from './RoleSelect';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { OwnerRoleVal } from '@fastgpt/global/support/permission/constant';

function MemberItemCard({
  avatar,
  key,
  onChange,
  isChecked,
  onDelete,
  name,
  role,
  orgs,
  rightSlot,
  onRoleChange
}: {
  avatar: string;
  key: string;
  onChange?: () => void;
  onRoleChange?: (role: RoleValueType) => void;
  isChecked?: boolean;
  onDelete?: () => void;
  name: string;
  role?: RoleValueType;
  orgs?: string[];
  rightSlot?: React.ReactNode;
}) {
  const isDisabled = role === OwnerRoleVal;
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
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
      onClick={() => {
        if (isDisabled) return;
        onChange?.();
      }}
    >
      {isChecked !== undefined && <Checkbox isChecked={isChecked} pointerEvents="none" />}
      <Avatar src={avatar} w="1.5rem" borderRadius={'50%'} />

      <Box w="full">
        <Box fontSize={'sm'} className="textEllipsis" maxW="300px">
          {name}
        </Box>
        <Box lineHeight={1}>{orgs && orgs.length > 0 && <OrgTags orgs={orgs} />}</Box>
      </Box>
      {role !== undefined && !!onRoleChange && (
        <RoleSelect
          disabled={role === OwnerRoleVal}
          value={role}
          Button={
            <Flex
              alignItems={'center'}
              bg={'myGray.50'}
              border="base"
              fontSize={'sm'}
              px={3}
              borderRadius={'md'}
              h={'40px'}
            >
              {role && (
                <Box py={2}>
                  <RoleTags permission={role} />
                </Box>
              )}
              <ChevronDownIcon fontSize={'md'} />
            </Flex>
          }
          onChange={onRoleChange}
        />
      )}
      {onDelete !== undefined && (
        <MyIcon
          name="common/closeLight"
          w="1rem"
          cursor={'pointer'}
          _hover={{
            color: 'red.600'
          }}
          onClick={() => {
            if (isDisabled) return;
            onDelete?.();
          }}
        />
      )}
      {rightSlot}
    </HStack>
  );
}

export default MemberItemCard;
