import React from 'react';
import { Box, Checkbox, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import RoleTags from './RoleTags';
import type { RoleValueType } from '@fastgpt/global/support/permission/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import OrgTags from '../../user/team/OrgTags';
import RoleSelect from './RoleSelect';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { useUserStore } from '@/web/support/user/useUserStore';

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
  onRoleChange,
  disabled = false
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
  disabled?: boolean;
}) {
  const showRoleSelect = onRoleChange !== undefined;
  const { userInfo } = useUserStore();
  return (
    <Flex
      justifyContent="space-between"
      alignItems="center"
      key={key}
      px="1"
      py="1"
      gap="2"
      borderRadius="sm"
      {...(!showRoleSelect
        ? {
            _hover: { bgColor: 'myGray.50' },
            cursor: 'pointer'
          }
        : {})}
      onClick={() => {
        if (disabled) return;
        onChange?.();
      }}
    >
      <Flex
        flexDirection={'row'}
        h={showRoleSelect ? '36px' : 'unset'}
        p="1"
        alignItems={'center'}
        gap="2"
        w="full"
      >
        {isChecked !== undefined && (
          <Checkbox isDisabled={disabled} isChecked={isChecked} pointerEvents="none" />
        )}
        <Avatar src={avatar} w="1.5rem" borderRadius={'50%'} />
        <Box flex={'1 0 0'} w={0}>
          <Box fontSize={'sm'} w={'100%'} noOfLines={1}>
            {name === DefaultGroupName ? userInfo?.team.teamName : name}
          </Box>
          <Box lineHeight={1} w={'100%'}>
            {orgs && orgs.length > 0 && <OrgTags orgs={orgs} />}
          </Box>
        </Box>
      </Flex>
      {showRoleSelect && (
        <RoleSelect
          disabled={disabled}
          value={role}
          Button={
            <Flex
              bg={'myGray.50'}
              border="base"
              fontSize={'sm'}
              borderRadius={'md'}
              minH={'18px'}
              w="300px"
              p="1"
              alignItems={'end'}
              justifyContent={'space-between'}
            >
              <RoleTags permission={role} />
              <Flex h="18px" alignItems={'center'} justifyContent={'center'}>
                <ChevronDownIcon fontSize="md" />
              </Flex>
            </Flex>
          }
          onChange={onRoleChange}
        />
      )}
      <Flex flexDirection={'row'} h={showRoleSelect ? '36px' : 'unset'} alignItems={'center'}>
        {onDelete !== undefined && !disabled ? (
          <MyIcon
            name="common/closeLight"
            w="1rem"
            cursor={disabled ? 'not-allowed' : 'pointer'}
            _hover={{
              color: 'red.600'
            }}
            onClick={() => {
              if (disabled) return;
              onDelete?.();
            }}
          />
        ) : (
          <Box minW="16px"></Box>
        )}
      </Flex>
      {!!rightSlot && rightSlot}
    </Flex>
  );
}

export default MemberItemCard;
