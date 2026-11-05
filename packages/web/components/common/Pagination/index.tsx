import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSystem } from '../../../hooks/useSystem';
import MyIcon from '../Icon';
import type { IconNameType } from '../Icon/type';
import MyMenu from '../MyMenu';

type Props = {
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

/** 受控分页展示；请求、缓存和滚动行为由调用方管理，空结果仍显示第一页。 */
const Pagination = React.forwardRef<HTMLDivElement, Props>(function Pagination(
  { total, page, pageSize, pageSizeOptions, isLoading = false, onPageChange, onPageSizeChange },
  ref
) {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const renderControl = ({
    icon,
    target,
    disabled,
    label
  }: {
    icon: IconNameType;
    target: number;
    disabled: boolean;
    label: string;
  }) => (
    <Flex
      as={'button'}
      type={'button'}
      aria-label={label}
      title={label}
      disabled={disabled || isLoading}
      alignItems={'center'}
      justifyContent={'center'}
      borderRadius={'full'}
      w={'24px'}
      h={'24px'}
      flexShrink={0}
      cursor={'pointer'}
      bg={'myGray.150'}
      _disabled={{ opacity: 0.5, cursor: 'default' }}
      onClick={() => onPageChange(target)}
    >
      <MyIcon name={icon} w={'6px'} color={'myGray.900'} />
    </Flex>
  );

  return (
    <Flex
      ref={ref}
      alignItems={'center'}
      justifyContent={'center'}
      fontSize={'sm'}
      userSelect={'none'}
      whiteSpace={'nowrap'}
    >
      {isPc && <Box color={'myGray.500'}>{t('common:total_num', { num: total })}</Box>}
      <Flex alignItems={'center'} ml={6} mr={4} gap={2}>
        {isPc &&
          renderControl({
            icon: 'common/first_page',
            target: 1,
            disabled: page <= 1,
            label: t('common:first_page')
          })}
        {renderControl({
          icon: 'common/leftArrowLight',
          target: page - 1,
          disabled: page <= 1,
          label: t('common:previous_page')
        })}
        <Box mx={2} color={'myGray.500'}>
          {page} /{' '}
          <Box as={'span'} color={'myGray.900'}>
            {maxPage}
          </Box>
        </Box>
        {renderControl({
          icon: 'common/rightArrow',
          target: page + 1,
          disabled: page >= maxPage,
          label: t('common:next_page')
        })}
        {isPc &&
          renderControl({
            icon: 'common/latest_page',
            target: maxPage,
            disabled: page >= maxPage,
            label: t('common:last_page')
          })}
      </Flex>
      {isPc && (
        <MyMenu
          menuList={[
            {
              children: pageSizeOptions.map((size) => ({
                label: `${size}`,
                isActive: size === pageSize,
                menuItemStyles:
                  size === pageSize ? { color: 'primary.700', fontWeight: 'bold' } : undefined,
                onClick: () => onPageSizeChange(size)
              }))
            }
          ]}
          Button={
            <Flex alignItems={'center'} cursor={'pointer'}>
              <Box color={'myGray.900'}>{pageSize}</Box>
              <Box mx={1} color={'myGray.500'}>
                /
              </Box>
              <Box color={'myGray.500'}>{t('common:page')}</Box>
              <MyIcon ml={1} name={'core/chat/chevronDown'} w={'14px'} color={'myGray.900'} />
            </Flex>
          }
        />
      )}
    </Flex>
  );
});

export default React.memo(Pagination);
