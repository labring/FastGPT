import React, { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { HStack, Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getLogUsers } from '@/web/core/app/api/log';
import type { LogUserType } from '@fastgpt/global/openapi/core/app/log/api';
import dayjs from 'dayjs';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';

export type SelectedUserType = {
  outLinkUid: string | null;
  tmbId: string | null;
};

const getUserKey = (user: { outLinkUid: string | null; tmbId: string | null }) => {
  if (user.outLinkUid) return `out_${user.outLinkUid}`;
  if (user.tmbId) return `tmb_${user.tmbId}`;
  return '';
};

const parseUserKey = (key: string): SelectedUserType => {
  if (key.startsWith('out_')) {
    return { outLinkUid: key.slice(4), tmbId: null };
  }
  if (key.startsWith('tmb_')) {
    return { outLinkUid: null, tmbId: key.slice(4) };
  }
  return { outLinkUid: null, tmbId: null };
};

const UserFilter = ({
  appId,
  dateRange,
  sources,
  selectedUsers,
  setSelectedUsers,
  isSelectAll,
  setIsSelectAll,
  w = '226px'
}: {
  appId: string;
  dateRange: DateRangeType;
  sources?: string[];
  selectedUsers: SelectedUserType[];
  setSelectedUsers: (users: SelectedUserType[]) => void;
  isSelectAll: boolean;
  setIsSelectAll: Dispatch<SetStateAction<boolean>>;
  w?: string;
}) => {
  const { t } = useTranslation();
  const [searchKey, setSearchKey] = useState('');

  const {
    data: usersData,
    loading,
    run
  } = useRequest(
    () =>
      getLogUsers({
        appId,
        dateStart: dayjs(dateRange.from || new Date()).format(),
        dateEnd: dayjs(dateRange.to || new Date()).format(),
        searchKey: searchKey || undefined,
        sources
      }),
    {
      manual: true,
      refreshDeps: [appId, dateRange.from, dateRange.to, searchKey, sources],
      debounceWait: 300
    }
  );

  const userList = useMemo(
    () =>
      (usersData?.list || [])
        .filter((item: LogUserType) => item.outLinkUid || item.tmbId)
        .map((item: LogUserType) => ({
          label: (
            <HStack spacing={1}>
              {item.avatar && <Avatar src={item.avatar} w={'1.2rem'} rounded={'full'} />}
              <Box color={'myGray.900'} className="textEllipsis" maxW={'150px'}>
                {item.name}
              </Box>
            </HStack>
          ),
          value: getUserKey(item)
        })),
    [usersData?.list]
  );

  const selectedKeys = useMemo(
    () => selectedUsers.map((u) => getUserKey(u)).filter(Boolean),
    [selectedUsers]
  );

  const handleSelect = (keys: string[]) => {
    const users = keys.map(parseUserKey).filter((u) => u.outLinkUid || u.tmbId);
    setSelectedUsers(users);
  };

  return (
    <Flex>
      <MultipleSelect<string>
        list={userList}
        value={selectedKeys}
        onSelect={(val) => handleSelect(val as string[])}
        isSelectAll={isSelectAll}
        setIsSelectAll={setIsSelectAll}
        h={'36px'}
        w={w}
        rounded={'8px'}
        formLabelFontSize={'sm'}
        formLabel={t('app:logs_chat_user')}
        tagStyle={{
          px: 1,
          borderRadius: 'sm',
          bg: 'myGray.100',
          w: '76px',
          overflow: 'hidden'
        }}
        inputValue={searchKey}
        setInputValue={setSearchKey}
        isLoading={loading}
        onOpenFunc={() => run()}
      />
    </Flex>
  );
};

export default UserFilter;
