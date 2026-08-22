import {
  useRef,
  useState,
  useCallback,
  type RefObject,
  type ReactNode,
  useMemo,
  useEffect
} from 'react';
import type { FlexProps } from '@chakra-ui/react';
import { Flex, Box, type BoxProps } from '@chakra-ui/react';
import MyIcon from '../components/common/Icon';
import type { IconNameType } from '../components/common/Icon/type';
import { useTranslation } from 'next-i18next';
import { useToast } from './useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  useBoolean,
  useCreation,
  useMemoizedFn,
  useRequest,
  useScroll,
  useThrottleEffect
} from 'ahooks';

import { type PaginationProps, type PaginationResponse } from '@fastgpt/global/openapi/api';
import MyMenu from '../components/common/MyMenu';
import { useSystem } from './useSystem';
import { useRouter } from 'next/router';

const thresholdVal = 200;

/**
 * 从分页内容区向上定位实际的纵向滚动容器并回到顶部。
 * 桌面端通常由表格接管滚动，移动端则可能由更外层页面统一滚动。
 */
const scrollPaginationContentToTop = (target?: HTMLElement | null) => {
  if (!target || typeof window === 'undefined') return;

  let currentElement: HTMLElement | null = target;
  while (currentElement) {
    const overflowY = window.getComputedStyle(currentElement).overflowY;
    const hasVerticalOverflow = currentElement.scrollHeight > currentElement.clientHeight + 1;

    if (['auto', 'scroll', 'overlay'].includes(overflowY) && hasVerticalOverflow) {
      currentElement.scrollTop = 0;
      return;
    }
    currentElement = currentElement.parentElement;
  }

  if (document.scrollingElement) {
    document.scrollingElement.scrollTop = 0;
  }
};

export function usePagination<DataT, ResT = unknown>(
  api: (data: PaginationProps<DataT>) => Promise<PaginationResponse<ResT>>,
  {
    defaultPageSize = 10,
    pageSizeOptions: defaultPageSizeOptions,
    params,
    type = 'button',
    onChange,
    refreshDeps,
    scrollLoadType = 'bottom',
    EmptyTip,
    pollingInterval,
    pollingWhenHidden = false,
    storeToQuery = false,
    scrollContainerRef,
    pageSizeCacheKey
  }: {
    defaultPageSize?: number;
    pageSizeOptions?: number[];
    params?: DataT;
    type?: 'button' | 'scroll';
    onChange?: (pageNum: number) => void;
    refreshDeps?: any[];
    throttleWait?: number;
    scrollLoadType?: 'top' | 'bottom';
    EmptyTip?: React.JSX.Element;
    pollingInterval?: number;
    pollingWhenHidden?: boolean;
    storeToQuery?: boolean;
    scrollContainerRef?: RefObject<HTMLElement | null>;
    pageSizeCacheKey?: string;
  }
) {
  const router = useRouter();
  const { page = '1' } = router.query as { page: string };
  const numPage = Number(page);

  const { toast } = useToast();
  const { isPc } = useSystem();
  const { t } = useTranslation();

  const [isLoading, { setTrue, setFalse }] = useBoolean(false);
  const [error, setError] = useState<Error | null>(null);

  const [pageNum, setPageNum] = useState(numPage);
  const pageSizeOptions = useCreation(
    () => defaultPageSizeOptions || [10, 20, 50, 100],
    [defaultPageSizeOptions]
  );
  const pageSizeStorageKey = pageSizeCacheKey
    ? `fastgpt:pagination:page-size:${pageSizeCacheKey}`
    : undefined;
  const [pageSize, setPageSize] = useState(() => {
    if (!pageSizeStorageKey || typeof window === 'undefined') return defaultPageSize;

    try {
      const cachedPageSize = Number(window.localStorage.getItem(pageSizeStorageKey));
      return pageSizeOptions.includes(cachedPageSize) ? cachedPageSize : defaultPageSize;
    } catch {
      return defaultPageSize;
    }
  });
  const previousPageSizeRef = useRef(pageSize);
  const updatePageSize = useMemoizedFn((nextPageSize: number) => {
    setPageSize(nextPageSize);

    if (!pageSizeStorageKey) return;
    try {
      window.localStorage.setItem(pageSizeStorageKey, `${nextPageSize}`);
    } catch {
      // 浏览器禁用本地存储时仅跳过缓存，不影响分页功能。
    }
  });

  const [total, setTotal] = useState(0);
  const [data, setData] = useState<ResT[]>([]);
  const paginationRef = useRef<HTMLDivElement>(null);
  const totalDataLength = useMemo(() => Math.max(total, data.length), [total, data.length]);

  const isEmpty = total === 0 && !isLoading;
  const noMore = data.length > 0 && data.length >= totalDataLength;

  const fetchData = useMemoizedFn(
    async (
      num: number = pageNum,
      ScrollContainerRef?: RefObject<HTMLDivElement>,
      scrollToTop = false
    ) => {
      if (noMore && num !== 1) return;

      setTrue();
      setError(null);

      try {
        const res = await api({
          pageNum: num,
          pageSize,
          ...params
        });

        setPageNum(num);
        if (storeToQuery && num !== pageNum) {
          router.replace({
            pathname: router.pathname,
            query: {
              ...router.query,
              page: num
            }
          });
        }

        if (res.total !== undefined) {
          setTotal(res.total);
        }

        if (type === 'scroll') {
          if (scrollLoadType === 'top') {
            const prevHeight = ScrollContainerRef?.current?.scrollHeight || 0;
            const prevScrollTop = ScrollContainerRef?.current?.scrollTop || 0;
            // 使用 requestAnimationFrame 来调整滚动位置
            function adjustScrollPosition() {
              requestAnimationFrame(
                ScrollContainerRef?.current
                  ? () => {
                      if (ScrollContainerRef?.current) {
                        const newHeight = ScrollContainerRef.current.scrollHeight;
                        const heightDiff = newHeight - prevHeight;
                        ScrollContainerRef.current.scrollTop = prevScrollTop + heightDiff;
                      }
                    }
                  : adjustScrollPosition
              );
            }

            setData((prevData) => (num === 1 ? res.list : [...res.list, ...prevData]));
            adjustScrollPosition();
          } else {
            setData((prevData) => (num === 1 ? res.list : [...prevData, ...res.list]));
          }
        } else {
          setData(res.list);
        }

        if (type === 'button' && scrollToTop) {
          window.requestAnimationFrame(() => {
            scrollPaginationContentToTop(scrollContainerRef?.current ?? paginationRef.current);
          });
        }

        onChange?.(num);
      } catch (error: any) {
        setError(error);
        if (error.code !== 'ERR_CANCELED') {
          toast({
            title: getErrText(error, t('common:core.chat.error.data_error')),
            status: 'error'
          });
        }
      }

      setFalse();
    }
  );

  // Button pagination
  const Pagination = useCallback(() => {
    const maxPage = Math.ceil(totalDataLength / pageSize);

    const IconButton = ({
      icon,
      isDisabled,
      onClick,
      ...props
    }: {
      icon: IconNameType;
      isDisabled?: boolean;
      onClick: () => void;
    } & FlexProps) => {
      isDisabled = isDisabled || isLoading;
      return (
        <Flex
          alignItems={'center'}
          justifyContent={'center'}
          borderRadius={'full'}
          w={'24px'}
          h={'24px'}
          cursor={'pointer'}
          bg={'myGray.150'}
          {...(isDisabled
            ? {
                opacity: 0.5
              }
            : {
                onClick
              })}
          {...props}
        >
          <MyIcon name={icon} w={'6px'} color={'myGray.900'} />
        </Flex>
      );
    };

    return (
      <Flex
        ref={paginationRef}
        alignItems={'center'}
        justifyContent={'center'}
        fontSize={'sm'}
        userSelect={'none'}
      >
        {isPc && <Box color={'myGray.500'}>{t('common:total_num', { num: totalDataLength })}</Box>}

        <Flex alignItems={'center'} ml={6} mr={4}>
          {isPc && (
            <IconButton
              mr={2}
              isDisabled={pageNum === 1}
              icon="common/first_page"
              onClick={() => fetchData(1, undefined, true)}
            />
          )}
          <IconButton
            isDisabled={pageNum === 1}
            icon="common/leftArrowLight"
            onClick={() => fetchData(pageNum - 1, undefined, true)}
          />
          <Box ml={4} color={'myGray.500'}>
            {pageNum}
          </Box>
          <Box mx={1} color={'myGray.500'}>
            /
          </Box>
          <Box mr={4} color={'myGray.900'}>
            {maxPage}
          </Box>

          <IconButton
            isDisabled={pageNum === maxPage}
            icon="common/rightArrow"
            onClick={() => fetchData(pageNum + 1, undefined, true)}
          />
          {isPc && (
            <IconButton
              ml={2}
              isDisabled={pageNum === maxPage}
              icon="common/latest_page"
              onClick={() => fetchData(maxPage, undefined, true)}
            />
          )}
        </Flex>

        {isPc && (
          <MyMenu
            menuList={[
              {
                label: '',
                children: pageSizeOptions.map((item) => ({
                  label: `${item}`,
                  isActive: pageSize === item,
                  menuItemStyles:
                    pageSize === item ? { color: 'primary.700', fontWeight: 'bold' } : undefined,
                  onClick: () => updatePageSize(item)
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
  }, [
    totalDataLength,
    isPc,
    pageSize,
    t,
    pageNum,
    pageSizeOptions,
    isLoading,
    fetchData,
    updatePageSize
  ]);

  // Scroll pagination
  const DefaultRef = useRef<HTMLDivElement>(null);
  const ScrollData = useMemoizedFn(
    ({
      children,
      ScrollContainerRef,
      ...props
    }: {
      children: ReactNode;
      ScrollContainerRef?: RefObject<HTMLDivElement>;
    } & BoxProps) => {
      const ref = ScrollContainerRef || DefaultRef;
      const loadText = (() => {
        if (isLoading) return t('common:is_requesting');
        if (noMore) return t('common:request_end');
        return t('common:request_more');
      })();

      const scroll = useScroll(ref);

      // Watch scroll position
      useThrottleEffect(
        () => {
          if (!ref?.current || type !== 'scroll' || noMore || isLoading || data.length === 0)
            return;
          const { scrollTop, scrollHeight, clientHeight } = ref.current;

          if (
            (scrollLoadType === 'bottom' &&
              scrollTop + clientHeight >= scrollHeight - thresholdVal) ||
            (scrollLoadType === 'top' && scrollTop < thresholdVal)
          ) {
            fetchData(pageNum + 1, ref);
          }
        },
        [scroll, isLoading],
        { wait: 50 }
      );

      return (
        <Box {...props} ref={ref} overflow={'overlay'}>
          {scrollLoadType === 'top' && total > 0 && isLoading && (
            <Box mt={2} fontSize={'xs'} color={'blackAlpha.500'} textAlign={'center'}>
              {t('common:is_requesting')}
            </Box>
          )}
          {children}
          {scrollLoadType === 'bottom' && !isEmpty && (
            <Box
              mt={2}
              fontSize={'xs'}
              color={'blackAlpha.500'}
              textAlign={'center'}
              cursor={loadText === t('common:request_more') ? 'pointer' : 'default'}
              onClick={() => {
                if (loadText !== t('common:request_more')) return;
                fetchData(pageNum + 1);
              }}
            >
              {loadText}
            </Box>
          )}
          {isEmpty && EmptyTip}
        </Box>
      );
    }
  );

  // Reload data
  const isFirstLoad = useRef(true);
  const { runAsync: refresh } = useRequest(
    async () => {
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        fetchData(numPage);
        return;
      }

      fetchData(1, undefined, true);
    },
    {
      manual: false,
      refreshDeps,
      throttleWait: 100
    }
  );
  // Page size refresh
  useEffect(() => {
    if (previousPageSizeRef.current === pageSize) return;
    previousPageSizeRef.current = pageSize;

    if (data.length > 0) {
      fetchData(pageNum, undefined, true);
    }
  }, [data.length, fetchData, pageNum, pageSize]);

  useRequest(
    async () => {
      if (!pollingInterval) return;
      await fetchData(pageNum);
    },
    {
      pollingInterval,
      pollingWhenHidden,
      manual: false,
      refreshDeps: [pollingInterval]
    }
  );

  return {
    pageNum,
    setPageNum,
    pageSize,
    total: totalDataLength,
    data,
    setData,
    isLoading,
    error,
    Pagination,
    ScrollData,
    getData: fetchData,
    refresh
  };
}
