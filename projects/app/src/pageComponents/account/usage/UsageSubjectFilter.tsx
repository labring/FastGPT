import React, { useMemo, useRef, useState } from 'react';
import {
  Box,
  Checkbox,
  Flex,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Portal
} from '@chakra-ui/react';
import FilterButton, {
  FilterSummaryValue,
  useFilterTriggerWidth
} from '@fastgpt/web/components/common/TagFilter/FilterButton';
import FilterSearchInput from '@fastgpt/web/components/common/TagFilter/FilterSearchInput';
import {
  filterPopoverProps,
  getFilterListBoxProps
} from '@fastgpt/web/components/common/TagFilter/styles';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { DEFAULT_FILTER_ORG_AVATAR } from '@fastgpt/global/common/system/constants';
import type { UsageSubjectFilter as UsageSubjectFilterType } from '@fastgpt/global/support/wallet/usage/filter';
import FolderPath from '@/components/common/folder/Path';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { UsageFilterController } from './useUsageFilterController';
import { getUsageMemberStatusLabel, UsageMemberStatusTag } from './UsageMember';

const joinedPopoverProps = {
  placement: filterPopoverProps.placement,
  offset: filterPopoverProps.offset,
  closeOnBlur: filterPopoverProps.closeOnBlur,
  trigger: filterPopoverProps.trigger,
  isLazy: true,
  lazyBehavior: 'unmount' as const
};

const joinedButtonSx = {
  '&:hover': { zIndex: 1 },
  '&[aria-expanded="true"]': {
    borderColor: 'primary.600',
    boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
    zIndex: 2
  }
};

const anchorStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none'
};

const baseItemProps = {
  alignItems: 'center',
  px: 1,
  py: '6px',
  cursor: 'pointer',
  borderRadius: 'xs',
  fontSize: 'xs',
  lineHeight: '16px',
  fontWeight: 'medium'
} as const;

/**
 * 用量主体筛选器：双下拉拼接触发器（左侧切换成员/部门/群组，右侧承载「全部」、部门面包屑、搜索与多选列表）。
 * 两侧浮层均对齐整个拼接触发器左边缘；部门父子层级勾选相互独立，仅点击右侧箭头进入子部门。
 */
const UsageSubjectFilter = ({ controller }: { controller: UsageFilterController }) => {
  const { t } = useSafeTranslation();
  const { userInfo } = useUserStore();
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const emptyFocusRef = useRef<HTMLElement>(null);
  const rightPopoverRef = useRef<HTMLElement>(null);
  const { subjectFilter, context, options, directory, search, directoryId } = controller;

  const typeOptions = useMemo<Array<{ value: UsageSubjectFilterType['type']; label: string }>>(
    () => [
      { value: 'member', label: t('account_usage:member') },
      { value: 'department', label: t('account_usage:department') },
      { value: 'group', label: t('account_usage:group') }
    ],
    [t]
  );

  const getLabel = (item: { name: string; isDefault?: boolean }) =>
    item.isDefault ? t('account_usage:default_group') : item.name;
  const selectedItems = context?.selectedItems ?? [];
  const firstSelected =
    selectedItems[0] ??
    (subjectFilter.ids[0] ? options.find((item) => item.id === subjectFilter.ids[0]) : undefined);
  const summary = firstSelected ? getLabel(firstSelected) : t('common:All');
  const { triggerRef, triggerWidth } = useFilterTriggerWidth(
    `${subjectFilter.type}-${summary}-${subjectFilter.ids.length}`
  );

  if (!controller.canManageMembers) return null;

  const isDepartment = subjectFilter.type === 'department';
  const selected = subjectFilter.ids.length > 0;
  const currentTypeLabel =
    typeOptions.find((item) => item.value === subjectFilter.type)?.label ?? '';

  return (
    <Flex
      ref={triggerRef}
      position={'relative'}
      alignItems={'center'}
      isolation={'isolate'}
      minW={0}
      w={['100%', 'auto']}
    >
      <Popover
        {...joinedPopoverProps}
        initialFocusRef={emptyFocusRef}
        isOpen={typeMenuOpen}
        onOpen={() => {
          controller.close();
          setTypeMenuOpen(true);
        }}
        onClose={() => setTypeMenuOpen(false)}
      >
        <PopoverAnchor>
          <span style={anchorStyle} />
        </PopoverAnchor>
        <PopoverTrigger>
          <FilterButton
            w={'fit-content'}
            maxW={'200px'}
            borderRightRadius={0}
            mr={'-1px'}
            sx={joinedButtonSx}
            value={currentTypeLabel}
          />
        </PopoverTrigger>
        <Portal>
          <PopoverContent
            zIndex={1001}
            w={triggerWidth ? `${triggerWidth}px` : 'max-content'}
            minW={'120px'}
            maxW={'calc(100vw - 24px)'}
          >
            <Box p={'6px'} onClick={(e) => e.stopPropagation()}>
              {typeOptions.map((item) => {
                const active = item.value === subjectFilter.type;
                return (
                  <Flex
                    key={item.value}
                    as={'button'}
                    type={'button'}
                    w={'100%'}
                    textAlign={'left'}
                    {...baseItemProps}
                    bg={active ? 'myGray.05' : 'transparent'}
                    color={active ? 'primary.700' : 'myGray.600'}
                    _hover={{ bg: 'myGray.05' }}
                    onClick={() => {
                      controller.changeType(item.value);
                      setTypeMenuOpen(false);
                    }}
                  >
                    {item.label}
                  </Flex>
                );
              })}
            </Box>
          </PopoverContent>
        </Portal>
      </Popover>

      <Popover
        {...joinedPopoverProps}
        initialFocusRef={emptyFocusRef}
        isOpen={controller.isOpen}
        onOpen={() => {
          setTypeMenuOpen(false);
          controller.open();
        }}
        onClose={controller.close}
      >
        <PopoverAnchor>
          <span style={anchorStyle} />
        </PopoverAnchor>
        <PopoverTrigger>
          <FilterButton
            flex={[1, '0 1 auto']}
            w={['auto', 'fit-content']}
            maxW={'200px'}
            borderLeftRadius={0}
            sx={joinedButtonSx}
            value={
              <FilterSummaryValue
                text={summary}
                chip={selected}
                extraCount={Math.max(0, subjectFilter.ids.length - 1)}
              />
            }
          />
        </PopoverTrigger>
        <Portal>
          <PopoverContent
            ref={rightPopoverRef}
            zIndex={1001}
            w={isDepartment ? '280px' : '220px'}
            minW={triggerWidth ? `${triggerWidth}px` : undefined}
            maxW={'calc(100vw - 24px)'}
          >
            <MyBox
              isLoading={controller.optionsLoading}
              p={'6px'}
              onClick={(e) => e.stopPropagation()}
            >
              <Flex direction={'column'} gap={'4px'} minW={0}>
                <Flex
                  as={'button'}
                  type={'button'}
                  w={'100%'}
                  textAlign={'left'}
                  {...baseItemProps}
                  bg={selected ? 'transparent' : 'myGray.05'}
                  color={selected ? 'myGray.600' : 'primary.700'}
                  _hover={{ bg: 'myGray.05' }}
                  onClick={() => {
                    if (selected) controller.clear();
                  }}
                >
                  {t('common:All')}
                </Flex>

                {isDepartment && !search && (
                  <Flex
                    h={'20px'}
                    minW={0}
                    pl={1}
                    gap={1}
                    alignItems={'center'}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <Box
                      flexShrink={0}
                      color={'myGray.600'}
                      fontSize={'mini'}
                      fontWeight={'medium'}
                    >
                      {t('account_usage:current_position')}
                    </Box>
                    <Box
                      flex={1}
                      minW={0}
                      overflow={'hidden'}
                      sx={{
                        '>div': { minW: 0 },
                        '>div>div': { minW: 0 },
                        '>div>div:first-of-type': { flexShrink: 0 },
                        '>div>div>svg': { flexShrink: 0 }
                      }}
                    >
                      <FolderPath
                        rootName={t('common:Team')}
                        paths={(directory?.breadcrumbs.slice(1) ?? []).map((item) => ({
                          parentId: item.id,
                          parentName: item.name
                        }))}
                        fontSize={'mini'}
                        onClick={(id) => controller.navigate(id ?? '')}
                      />
                    </Box>
                  </Flex>
                )}

                <FilterSearchInput
                  value={search}
                  placeholder={
                    isDepartment
                      ? t('account_usage:search_department', {
                          name: directoryId
                            ? (directory?.departmentDirectory?.name ?? '')
                            : t('common:Team')
                        })
                      : t('common:Search')
                  }
                  onChange={controller.searchOptions}
                />

                <Box
                  {...getFilterListBoxProps(true, 'md')}
                  minH={options.length ? undefined : '36px'}
                  onScroll={(e) => {
                    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget;
                    if (scrollHeight - scrollTop - clientHeight < 24) controller.loadMore();
                  }}
                >
                  {options.map((item) => {
                    const label = getLabel(item);
                    const isMember = subjectFilter.type === 'member';
                    const checked = subjectFilter.ids.includes(item.id);
                    const canNavigate = isDepartment && Boolean(item.hasChildren);
                    const status = isMember ? getUsageMemberStatusLabel(item, t) : '';
                    const isSelf = isMember && item.id === userInfo?.team.tmbId;

                    return (
                      <Flex
                        key={item.id}
                        {...baseItemProps}
                        justifyContent={'space-between'}
                        gap={2}
                        _hover={{ bg: 'myGray.05' }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest?.('.chakra-checkbox')) return;
                          controller.toggleItem(item);
                        }}
                      >
                        <Flex alignItems={'center'} gap={2} minW={0} flex={1}>
                          <Checkbox
                            isChecked={checked}
                            onChange={() => controller.toggleItem(item)}
                            aria-label={label}
                            size={'sm'}
                            flexShrink={0}
                            icon={<MyIcon name={'common/check'} w={'12px'} />}
                            sx={{
                              '.chakra-checkbox__control:not([data-checked]) svg': { opacity: 0 }
                            }}
                          />
                          <Avatar
                            src={isMember ? item.avatar : item.avatar || DEFAULT_FILTER_ORG_AVATAR}
                            w={'16px'}
                            h={'16px'}
                            borderRadius={'full'}
                            flexShrink={0}
                          />
                          <MyTooltip label={label} showOnlyWhenOverflow shouldWrapChildren={false}>
                            <Box className={'textEllipsis'} minW={0} color={'myGray.600'}>
                              {label}
                            </Box>
                          </MyTooltip>
                        </Flex>
                        {(status || isSelf || canNavigate) && (
                          <Flex
                            alignItems={'center'}
                            gap={1}
                            flexShrink={0}
                            color={'myGray.500'}
                            fontWeight={'normal'}
                          >
                            {status && <UsageMemberStatusTag status={status} py={'1px'} />}
                            {isSelf && <span>{t('common:filter_me')}</span>}
                            {canNavigate && (
                              <Flex
                                as={'button'}
                                type={'button'}
                                alignItems={'center'}
                                justifyContent={'center'}
                                w={'24px'}
                                h={'24px'}
                                my={'-4px'}
                                p={'4px'}
                                borderRadius={'sm'}
                                color={'myGray.500'}
                                aria-label={t('account_usage:open_department', { name: item.name })}
                                _hover={{ bg: 'myGray.05', color: 'myGray.700' }}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  rightPopoverRef.current?.focus({ preventScroll: true });
                                  controller.navigate(item.id);
                                }}
                              >
                                <MyIcon name={'core/chat/chevronRight'} w={'16px'} />
                              </Flex>
                            )}
                          </Flex>
                        )}
                      </Flex>
                    );
                  })}
                  {!controller.optionsLoading && options.length === 0 && (
                    <Box color={'myGray.500'} fontSize={'xs'} px={1} py={'6px'}>
                      {t('account_usage:no_options')}
                    </Box>
                  )}
                </Box>
              </Flex>
            </MyBox>
          </PopoverContent>
        </Portal>
      </Popover>
    </Flex>
  );
};

export default React.memo(UsageSubjectFilter);
