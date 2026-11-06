import React from 'react';
import { Box, Button, Checkbox, Flex } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import FilterButton, {
  FilterSummaryValue
} from '@fastgpt/web/components/common/TagFilter/FilterButton';
import FilterSearchInput from '@fastgpt/web/components/common/TagFilter/FilterSearchInput';
import {
  filterPopoverProps,
  filterListScrollSx
} from '@fastgpt/web/components/common/TagFilter/styles';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import FolderPath from '@/components/common/folder/Path';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { UsageFilterController } from './useUsageFilterController';
import { UsageMember } from './UsageMember';

/** Figma 的固定双栏主体选择器；目录导航与部门选择分别操作，搜索结果不显示路径。 */
const UsageSubjectFilter = ({ controller }: { controller: UsageFilterController }) => {
  const { t } = useSafeTranslation();
  const { userInfo } = useUserStore();
  const { subjectFilter, context, options, directory, search, directoryId } = controller;
  const types = [
    { type: 'member' as const, label: t('account_usage:member') },
    { type: 'department' as const, label: t('account_usage:department') },
    { type: 'group' as const, label: t('account_usage:group') }
  ];
  const selectedItems = context?.selectedItems ?? [];
  const selected =
    subjectFilter.type === 'department'
      ? subjectFilter.rules.some((rule) => rule.include)
      : subjectFilter.ids.length > 0;
  const itemName = (item: (typeof selectedItems)[number]) =>
    item.isDefault ? t('account_usage:default_group') : item.name;
  const summary = selectedItems[0] ? itemName(selectedItems[0]) : t('common:All');
  const states = new Map(context?.departmentCheckStates?.map((item) => [item.orgId, item.state]));
  const isDepartment = subjectFilter.type === 'department';
  const listHeight = isDepartment ? (search ? 48 : directoryId ? 56 : 84) : 188;
  if (!controller.canManageMembers) return null;
  return (
    <Flex alignItems={'center'} minW={0} w={['100%', 'auto']}>
      <MyPopover
        {...filterPopoverProps}
        w={'280px'}
        maxW={'calc(100vw - 24px)'}
        isOpen={controller.isOpen}
        onOpenFunc={controller.open}
        onCloseFunc={controller.close}
        Trigger={
          <FilterButton
            flexShrink={[1, 0]}
            title={types.find((item) => item.type === subjectFilter.type)?.label}
            value={
              <FilterSummaryValue
                text={summary}
                chip={selected}
                extraCount={Math.max(0, selectedItems.length - 1)}
              />
            }
          />
        }
      >
        {() => (
          <MyBox
            isLoading={controller.optionsLoading}
            p={'6px'}
            onClick={(e) => e.stopPropagation()}
          >
            <Flex gap={1} minH={'92px'} alignItems={'stretch'}>
              <Flex w={'80px'} flexShrink={0} direction={'column'} gap={1} role={'tablist'}>
                {types.map(({ type, label }) => (
                  <Box
                    key={type}
                    as={'button'}
                    type={'button'}
                    role={'tab'}
                    aria-selected={subjectFilter.type === type}
                    textAlign={'left'}
                    h={'28px'}
                    px={1}
                    borderRadius={'xs'}
                    fontSize={'mini'}
                    lineHeight={'16px'}
                    fontWeight={'medium'}
                    bg={subjectFilter.type === type ? 'primary.50' : 'transparent'}
                    color={subjectFilter.type === type ? 'primary.700' : 'myGray.600'}
                    _hover={{
                      bg: subjectFilter.type === type ? 'primary.50' : 'myGray.05'
                    }}
                    onClick={() => controller.changeType(type)}
                  >
                    {label}
                  </Box>
                ))}
              </Flex>
              <Box w={0} flexShrink={0} position={'relative'}>
                <Box position={'absolute'} left={'-0.5px'} w={'1px'} h={'100%'} bg={'myGray.200'} />
              </Box>
              <Flex direction={'column'} flex={1} minW={0} gap={1}>
                {isDepartment && !search && (
                  <Flex h={'20px'} minW={0} gap={1} alignItems={'center'}>
                    <Box
                      flexShrink={0}
                      color={'myGray.600'}
                      fontSize={'mini'}
                      fontWeight={'medium'}
                      lineHeight={'16px'}
                    >
                      {t('account_usage:current_position')}
                    </Box>
                    <Box
                      flex={1}
                      minW={0}
                      overflow={'hidden'}
                      sx={{
                        '>div': { minWidth: 0, height: '20px' },
                        // 保留根级与折叠入口的点击空间，其余宽度优先分配末级。
                        '>div>div': { minWidth: 0, flex: '1 1 0' },
                        '>div>div:first-child, >div>div:has(.chakra-menu__menu-button)': {
                          flex: '0 0 auto'
                        },
                        '>div>div:last-child': { flex: '2 1 0', minWidth: '32px' },
                        '>div>div>svg': { mx: '1px', width: '4px', flexShrink: 0 },
                        '.textEllipsis': {
                          minWidth: 0,
                          flex: 1,
                          padding: '2px 0',
                          fontSize: '12px',
                          lineHeight: '16px'
                        }
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
                <Box sx={{ input: { fontSize: 'sm', lineHeight: '20px' } }}>
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
                </Box>
                <Box
                  py={1}
                  maxH={`${listHeight + 8}px`}
                  h={isDepartment ? `${listHeight + 8}px` : undefined}
                  minH={options.length ? undefined : '36px'}
                  overflowY={'auto'}
                  overflowX={'hidden'}
                  sx={filterListScrollSx}
                  onWheel={(e) => e.stopPropagation()}
                  role={'group'}
                  aria-label={types.find((item) => item.type === subjectFilter.type)?.label}
                  onScroll={(e) => {
                    const target = e.currentTarget;
                    if (target.scrollHeight - target.scrollTop - target.clientHeight < 24)
                      controller.loadMore();
                  }}
                >
                  {options.map((item) => {
                    const state = states.get(item.id) ?? 'none';
                    const checked =
                      subjectFilter.type === 'department'
                        ? state === 'all'
                        : subjectFilter.ids.includes(item.id);
                    const partial = isDepartment && state === 'partial';
                    const canNavigate = isDepartment && Boolean(item.hasChildren) && !search;
                    return (
                      <Flex
                        key={item.id}
                        alignItems={'center'}
                        gap={2}
                        h={'28px'}
                        px={1}
                        borderRadius={'xs'}
                        fontSize={'xs'}
                        lineHeight={'16px'}
                        fontWeight={'medium'}
                        cursor={isDepartment ? 'default' : 'pointer'}
                        _hover={{ bg: 'myGray.05' }}
                        {...(isDepartment
                          ? {}
                          : {
                              role: 'checkbox',
                              'aria-checked': partial ? 'mixed' : checked,
                              tabIndex: 0,
                              'aria-label': itemName(item),
                              onClick: () => controller.toggleItem(item),
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if (e.key === ' ' || e.key === 'Enter') {
                                  e.preventDefault();
                                  controller.toggleItem(item);
                                }
                              }
                            })}
                      >
                        <Checkbox
                          isChecked={checked}
                          isIndeterminate={partial}
                          pointerEvents={isDepartment ? 'auto' : 'none'}
                          tabIndex={isDepartment ? 0 : -1}
                          aria-label={isDepartment ? itemName(item) : undefined}
                          onClick={(e) => e.stopPropagation()}
                          onChange={isDepartment ? () => controller.toggleItem(item) : undefined}
                          size={'sm'}
                          flexShrink={0}
                          sx={{
                            '.chakra-checkbox__control': {
                              width: '14px',
                              height: '14px',
                              borderWidth: '1px',
                              borderColor: 'myGray.300',
                              '&[data-checked], &[data-indeterminate]': {
                                bg: 'primary.50',
                                color: 'primary.600',
                                borderColor: 'primary.600'
                              }
                            }
                          }}
                        />
                        {subjectFilter.type === 'member' ? (
                          <UsageMember
                            member={item}
                            compact
                            flex={1}
                            isSelf={item.id === userInfo?.team.tmbId}
                          />
                        ) : (
                          <>
                            <Avatar
                              src={item.avatar || '/imgs/avatar/filterOrgAvatar.png'}
                              w={'16px'}
                              flexShrink={0}
                            />
                            <MyTooltip
                              label={itemName(item)}
                              showOnlyWhenOverflow
                              shouldWrapChildren={false}
                            >
                              <Box
                                as={canNavigate ? 'button' : 'span'}
                                {...(canNavigate
                                  ? {
                                      type: 'button',
                                      onClick: (e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        controller.navigate(item.id);
                                      },
                                      onKeyDown: (e: React.KeyboardEvent) => {
                                        e.stopPropagation();
                                      }
                                    }
                                  : {})}
                                minW={0}
                                flex={1}
                                color={'myGray.600'}
                                className={'textEllipsis'}
                                textAlign={'left'}
                                cursor={canNavigate ? 'pointer' : 'default'}
                              >
                                {itemName(item)}
                              </Box>
                            </MyTooltip>
                            {isDepartment && item.hasChildren && !search && (
                              <Box
                                as={'button'}
                                type={'button'}
                                aria-label={t('account_usage:open_department', { name: item.name })}
                                display={'flex'}
                                alignItems={'center'}
                                justifyContent={'center'}
                                w={'24px'}
                                h={'24px'}
                                flexShrink={0}
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  controller.navigate(item.id);
                                }}
                                onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
                              >
                                <MyIcon
                                  name={'core/chat/chevronDown'}
                                  w={'16px'}
                                  transform={'rotate(-90deg)'}
                                />
                              </Box>
                            )}
                          </>
                        )}
                      </Flex>
                    );
                  })}
                  {!controller.optionsLoading && !options.length && (
                    <Box color={'myGray.500'} fontSize={'xs'} px={1} py={'6px'}>
                      {t('account_usage:no_options')}
                    </Box>
                  )}
                </Box>
              </Flex>
            </Flex>
          </MyBox>
        )}
      </MyPopover>
      {selected && (
        <Button
          variant={'transparentBase'}
          color={'primary.700'}
          size={'sm'}
          px={2}
          flexShrink={0}
          _hover={{ bg: 'transparent' }}
          onClick={controller.clear}
        >
          {t('common:Clear')}
        </Button>
      )}
    </Flex>
  );
};

export default React.memo(UsageSubjectFilter);
