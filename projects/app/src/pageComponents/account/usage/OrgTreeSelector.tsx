import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  Flex,
  HStack,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  useDisclosure
} from '@chakra-ui/react';
import { getOrgList } from '@/web/support/user/team/org/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Path from '@/components/common/folder/Path';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useTranslation } from 'next-i18next';
import type { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

interface OrgTreeSelectorProps {
  value: string[];
  onSelect: (val: string[]) => void;
  isSelectAll?: boolean;
  setIsSelectAll?: React.Dispatch<React.SetStateAction<boolean>>;
  h?: string;
  bg?: string;
  rounded?: string;
  borderColor?: string;
  placeholder?: string;
}

const OrgTreeSelector = ({
  value,
  onSelect,
  isSelectAll,
  setIsSelectAll,
  h = '32px',
  bg = 'white',
  rounded = '4px',
  borderColor = 'myGray.200',
  placeholder
}: OrgTreeSelectorProps) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [orgStack, setOrgStack] = useState<{ _id: string; name: string }[]>([]);
  const [searchKey, setSearchKey] = useState('');
  const [debouncedSearchKey, setDebouncedSearchKey] = useState('');
  const [orgNameMap, setOrgNameMap] = useState<Record<string, string>>({});

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchKey(searchKey), 300);
    return () => clearTimeout(timer);
  }, [searchKey]);

  const currentOrgId = useMemo(
    () => (orgStack.length > 0 ? orgStack[orgStack.length - 1]._id : ''),
    [orgStack]
  );

  const { data: orgs = [], loading } = useRequest(
    () => getOrgList({ orgId: currentOrgId, searchKey: debouncedSearchKey }),
    { manual: false, refreshDeps: [currentOrgId, debouncedSearchKey] }
  );

  // 缓存已访问部门的名称
  useEffect(() => {
    const updates: Record<string, string> = {};
    orgs.forEach((o) => {
      updates[o._id] = o.name;
    });
    orgStack.forEach((o) => {
      updates[o._id] = o.name;
    });
    setOrgNameMap((prev) => ({ ...prev, ...updates }));
  }, [orgs, orgStack]);

  const paths = useMemo(
    () =>
      orgStack.map((org) => ({
        parentId: org._id,
        parentName: org.name
      })),
    [orgStack]
  );

  const onClickOrg = useCallback(
    (org: OrgListItemType) => {
      setOrgStack((prev) => [...prev, { _id: org._id, name: org.name }]);
      setSearchKey('');
      setDebouncedSearchKey('');
    },
    []
  );

  const onPathClick = useCallback(
    (parentId: ParentIdType) => {
      if (!parentId) {
        setOrgStack([]);
        return;
      }
      const index = orgStack.findIndex((o) => o._id === parentId);
      if (index >= 0) {
        setOrgStack(orgStack.slice(0, index + 1));
      }
    },
    [orgStack]
  );

  const toggleSelect = useCallback(
    (orgId: string) => {
      if (isSelectAll && setIsSelectAll) {
        setIsSelectAll(false);
      }
      if (value.includes(orgId)) {
        onSelect(value.filter((id) => id !== orgId));
      } else {
        onSelect([...value, orgId]);
      }
    },
    [isSelectAll, setIsSelectAll, value, onSelect]
  );

  const onSelectAllClick = useCallback(() => {
    if (setIsSelectAll) {
      setIsSelectAll((state) => !state);
    }
    if (!isSelectAll) {
      onSelect([]);
    }
  }, [isSelectAll, setIsSelectAll, onSelect]);

  const selectedLabels = useMemo(
    () => value.map((id) => orgNameMap[id] || id),
    [value, orgNameMap]
  );

  const visibleCount = useMemo(() => {
    let count = 0;
    let width = 0;
    const containerWidth = 120;
    for (let i = 0; i < selectedLabels.length; i++) {
      const labelWidth = 16 + selectedLabels[i].length * 8 + 20;
      if (width + labelWidth <= containerWidth) {
        width += labelWidth + 4;
        count++;
      } else {
        break;
      }
    }
    return count;
  }, [selectedLabels]);

  return (
    <Popover isOpen={isOpen} onOpen={onOpen} onClose={onClose} placement="bottom-start" matchWidth>
      <PopoverTrigger>
        <Flex
          alignItems={'center'}
          h={h}
          bg={bg}
          borderRadius={rounded}
          border={'1px solid'}
          borderColor={isOpen ? 'primary.600' : borderColor}
          px={3}
          cursor={'pointer'}
          _hover={{
            borderColor: 'primary.300'
          }}
          {...(isOpen
            ? {
                boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
              }
            : {})}
        >
          {isSelectAll ? (
            <Box fontSize={'sm'} color={'myGray.900'} flex={1}>
              {t('common:All')}
            </Box>
          ) : selectedLabels.length === 0 ? (
            <Box fontSize={'sm'} color={'myGray.500'} flex={1}>
              {placeholder || t('account_usage:org')}
            </Box>
          ) : (
            <Flex flex={1} gap={1} flexWrap={'nowrap'} overflow={'hidden'} alignItems={'center'}>
              {selectedLabels.slice(0, visibleCount).map((label, i) => (
                <MyTag
                  key={i}
                  bg={'myGray.100'}
                  color={'myGray.900'}
                  borderRadius={'sm'}
                  px={1}
                  py={1}
                  flexShrink={0}
                >
                  {label}
                </MyTag>
              ))}
              {selectedLabels.length > visibleCount && (
                <Box fontSize={'sm'} px={1} py={1} borderRadius={'sm'} bg={'myGray.100'}>
                  +{selectedLabels.length - visibleCount}
                </Box>
              )}
            </Flex>
          )}
          <MyIcon name={'core/chat/chevronDown'} color={'myWhite.1000'} w={4} h={4} ml={1} />
        </Flex>
      </PopoverTrigger>

      <PopoverContent w={'280px'} p={0} border={'1px solid #fff'}>
        <PopoverBody p={0}>
          {/* 搜索框 */}
          <Box px={2} pt={2}>
            <SearchInput
              placeholder={t('common:search')}
              bgColor="myGray.50"
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
            />
          </Box>

          {/* Path 导航 */}
          {orgStack.length > 0 && (
            <Box px={2} pb={1} mt={1}>
              <Path paths={paths} onClick={onPathClick} showReturnIcon />
            </Box>
          )}

          {/* 全选 */}
          {setIsSelectAll && (
            <Flex px={2} py={1.5} cursor={'pointer'} onClick={onSelectAllClick} _hover={{ bg: 'myGray.50' }}>
              <Checkbox isChecked={isSelectAll} pointerEvents={'none'} />
              <Box ml={2} fontSize={'sm'}>
                {t('common:All')}
              </Box>
            </Flex>
          )}

          {/* 部门列表 */}
          <Box maxH={'300px'} overflowY={'auto'}>
            {orgs.map((org) => {
              const isChecked = isSelectAll || value.includes(org._id);
              return (
                <Flex
                  key={org._id}
                  px={2}
                  py={1.5}
                  alignItems={'center'}
                  gap={2}
                  cursor={'pointer'}
                  _hover={{ bgColor: 'myGray.50' }}
                  onClick={() => toggleSelect(org._id)}
                >
                  <Checkbox isChecked={isChecked} pointerEvents={'none'} />
                  <MyAvatar src={org.avatar} w={'1.25rem'} borderRadius={'xs'} />
                  <Box flex={1} fontSize={'sm'} noOfLines={1}>
                    {org.name}
                  </Box>
                  {org.total > 0 && (
                    <Box
                      p={'4px'}
                      rounded={'6px'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClickOrg(org);
                      }}
                      _hover={{ bgColor: 'myGray.200' }}
                    >
                      <MyIcon name="core/chat/chevronRight" w="16px" />
                    </Box>
                  )}
                </Flex>
              );
            })}
            {!loading && orgs.length === 0 && (
              <Box px={2} py={4} textAlign={'center'} color={'myGray.500'} fontSize={'sm'}>
                {t('common:empty')}
              </Box>
            )}
          </Box>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

export default React.memo(OrgTreeSelector);
