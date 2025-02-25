'use client';
import {
  Box,
  Flex,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Spinner,
  Switch
} from '@chakra-ui/react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import { ChannelInfo, ChannelStatus, ChannelType } from '@/global/aiproxy/types';
import { useQueryClient, useMutation, useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  deleteChannel,
  getChannels,
  getChannelTypeNames,
  updateChannelStatus
} from '@/web/core/ai/config';
import UpdateChannelModal from './updateChannelModal';
import { useTranslation } from 'react-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getTranslationWithFallback } from '@/web/common/utils/i18n';

interface ChannelTableProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  operationType: 'create' | 'update';
  setOperationType: (type: 'create' | 'update') => void;
}

export default function ChannelTable({
  isOpen,
  onOpen,
  onClose,
  operationType,
  setOperationType
}: ChannelTableProps) {
  const { t } = useTranslation();
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [allChannels, setAllChannels] = useState<ChannelInfo[]>([]);

  // Add ref for intersection observer
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  const queryClient = useQueryClient();

  const { isLoading: isChannelTypeNamesLoading, data: channelTypeNames } = useQuery({
    queryKey: ['getChannelTypeNames'],
    queryFn: () => getChannelTypeNames()
  });

  const {
    data,
    isLoading: isChannelsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage
  } = useInfiniteQuery({
    queryKey: ['getChannels'],
    queryFn: ({ pageParam = 1 }) =>
      getChannels({
        page: pageParam,
        perPage: pageSize
      }),
    getNextPageParam: (lastPage, allPages) => {
      const nextPage = allPages.length + 1;
      return lastPage.total > allPages.length * pageSize ? nextPage : undefined;
    },
    onSuccess(data) {
      const channels = data.pages.flatMap((page) => page.channels);
      setAllChannels(channels);
      setTotal(data.pages[0]?.total || 0);
    }
  });

  // Intersection Observer setup
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      {
        threshold: 0,
        rootMargin: '200px 0px'
      }
    );

    const sentinel = sentinelRef.current;
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const updateChannelStatusMutation = useMutation(
    ({ id, status }: { id: string; status: number }) => updateChannelStatus(id, status),
    {
      onSuccess() {
        toast({
          status: 'success',
          title: t('common:channel.updateSuccess')
        });
        queryClient.invalidateQueries(['getChannels']);
        queryClient.invalidateQueries(['getChannelTypeNames']);
      },
      onError(err: any) {
        toast({
          status: 'error',
          title: t('common:channel.updateFailed'),
          description: err?.message || t('common:channel.updateFailed')
        });
      }
    }
  );

  const deleteChannelMutation = useMutation(({ id }: { id: string }) => deleteChannel(id), {
    onSuccess() {
      toast({
        status: 'success',
        title: t('common:channel.deleteSuccess')
      });
      queryClient.invalidateQueries(['getChannels']);
      queryClient.invalidateQueries(['getChannelTypeNames']);
    },
    onError(err: any) {
      toast({
        status: 'error',
        title: t('common:channel.deleteFailed'),
        description: err?.message || t('common:channel.deleteFailed')
      });
    }
  });

  // Update the button click handlers in the table actions column:
  const handleStatusUpdate = (id: string, currentStatus: number) => {
    const newStatus =
      currentStatus === ChannelStatus.ChannelStatusDisabled
        ? ChannelStatus.ChannelStatusEnabled
        : ChannelStatus.ChannelStatusDisabled;
    updateChannelStatusMutation.mutate({ id, status: newStatus });
  };

  const columnHelper = createColumnHelper<ChannelInfo>();

  const columns = [
    columnHelper.accessor((row) => row.id, {
      id: 'id',
      header: () => (
        <Flex display="inline-flex" alignItems="center" gap="16px">
          <Text>{t('common:channel.id')}</Text>
        </Flex>
      ),
      cell: (info) => (
        <Flex display="inline-flex" alignItems="center" gap="16px">
          <Text>{info.getValue()}</Text>
        </Flex>
      )
    }),
    columnHelper.accessor((row) => row.name, {
      id: 'name',
      header: () => <Text>{t('common:channel.name')}</Text>,
      cell: (info) => <Text>{info.getValue()}</Text>
    }),
    columnHelper.accessor((row) => row.type, {
      id: 'type',
      header: () => <Text>{t('common:channel.type')}</Text>,
      cell: (info) => {
        const channelName = channelTypeNames?.[String(info.getValue()) as ChannelType]?.name;
        const translationKey = `aiproxy_type_${String(info.getValue())}`;

        const displayName = getTranslationWithFallback(
          'account_model',
          translationKey,
          channelName || '',
          t as (key: string) => string
        );

        return <Text>{displayName}</Text>;
      }
    }),
    columnHelper.accessor((row) => row.request_count, {
      id: 'request_count',
      header: () => <Text>{t('common:channel.requestCount')}</Text>,
      cell: (info) => <Text>{info.getValue()}</Text>
    }),
    columnHelper.accessor((row) => row.status, {
      id: 'status',
      header: () => <Text>{t('common:channel.status')}</Text>,
      cell: (info) => {
        const status = info.getValue();

        return (
          <Switch
            size={'sm'}
            isChecked={status === ChannelStatus.ChannelStatusEnabled}
            onChange={(e) =>
              handleStatusUpdate(String(info.row.original.id), info.row.original.status)
            }
            colorScheme={'myBlue'}
          />
        );
      }
    }),

    columnHelper.display({
      id: 'actions',
      header: () => <Text>{t('common:channel.action')}</Text>,
      cell: (info) => (
        <Menu>
          <MenuButton
            display="inline-flex"
            p="4px"
            alignItems="center"
            gap="6px"
            borderRadius="6px"
            transition="all 0.2s"
            _hover={{ bg: 'myGray.50' }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.66663 3.33333C6.66663 2.59695 7.26358 2 7.99996 2C8.73634 2 9.33329 2.59695 9.33329 3.33333C9.33329 4.06971 8.73634 4.66667 7.99996 4.66667C7.26358 4.66667 6.66663 4.06971 6.66663 3.33333ZM6.66663 8C6.66663 7.26362 7.26358 6.66667 7.99996 6.66667C8.73634 6.66667 9.33329 7.26362 9.33329 8C9.33329 8.73638 8.73634 9.33333 7.99996 9.33333C7.26358 9.33333 6.66663 8.73638 6.66663 8ZM6.66663 12.6667C6.66663 11.9303 7.26358 11.3333 7.99996 11.3333C8.73634 11.3333 9.33329 11.9303 9.33329 12.6667C9.33329 13.403 8.73634 14 7.99996 14C7.26358 14 6.66663 13.403 6.66663 12.6667Z"
                fill="#485264"
              />
            </svg>
          </MenuButton>
          <MenuList
            minW="88px"
            p="6px"
            gap="2px"
            alignItems="flex-start"
            bg="white"
            borderRadius="6px"
          >
            <MenuItem
              display="flex"
              p="6px 4px"
              alignItems="center"
              gap="8px"
              alignSelf="stretch"
              borderRadius="4px"
              color="myGray.600"
              _hover={{
                bg: 'myGray.50',
                color: 'primary.600'
              }}
              onClick={() => {
                setOperationType('update');
                setChannelInfo(info.row.original);
                onOpen();
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M12.0523 2.93262L13.3722 4.25256L14.2789 3.34585C14.4462 3.17856 14.5299 3.0949 14.5773 3.00621C14.6844 2.80608 14.6844 2.56569 14.5773 2.36557C14.5299 2.27687 14.4462 2.19323 14.2789 2.02594C14.1116 1.85864 14.028 1.77497 13.9393 1.72752C13.7391 1.62045 13.4987 1.62045 13.2986 1.72752C13.2099 1.77497 13.1263 1.85862 12.959 2.02592L12.0523 2.93262Z"
                  fill="currentColor"
                />
                <path
                  d="M7.04104 10.4281C6.99727 10.4309 6.94313 10.4309 6.87317 10.4309H6.30799C6.15331 10.4309 6.07597 10.4309 6.0171 10.4003C5.9675 10.3745 5.92705 10.3341 5.90128 10.2845C5.8707 10.2256 5.8707 10.1483 5.8707 9.9936V9.42304C5.8707 9.26836 5.8707 9.19102 5.90128 9.13215C5.9046 9.12575 5.90817 9.1195 5.91198 9.11341C5.95109 9.0338 6.03139 8.9535 6.17161 8.81328L11.188 3.79689L12.5079 5.11682L7.49154 10.1332C7.32748 10.2973 7.24544 10.3793 7.15057 10.4093C7.11488 10.4206 7.07802 10.4269 7.04104 10.4281Z"
                  fill="currentColor"
                />
                <path
                  d="M5.62978 1.94104C5.00856 1.94103 4.50132 1.94103 4.08949 1.97523C3.66341 2.01061 3.28008 2.08603 2.92343 2.27129C2.38767 2.5496 1.95084 2.98643 1.67254 3.52218C1.48727 3.87884 1.41186 4.26216 1.37647 4.68826C1.34227 5.10009 1.34228 5.60732 1.34229 6.22854V10.3859C1.34228 11.0072 1.34227 11.5144 1.37647 11.9262C1.41186 12.3523 1.48727 12.7357 1.67254 13.0923C1.95084 13.6281 2.38767 14.0649 2.92343 14.3432C3.28008 14.5285 3.66341 14.6039 4.0895 14.6393C4.50134 14.6735 5.00858 14.6735 5.62983 14.6735H9.78716C10.4084 14.6735 10.9156 14.6735 11.3275 14.6393C11.7536 14.6039 12.1369 14.5285 12.4936 14.3432C13.0293 14.0649 13.4661 13.6281 13.7444 13.0923C13.9297 12.7357 14.0051 12.3523 14.0405 11.9263C14.0747 11.5144 14.0747 11.0072 14.0747 10.386V7.69404C14.0747 7.32585 13.7762 7.02737 13.408 7.02737C13.0398 7.02737 12.7414 7.32585 12.7414 7.69404V10.3575C12.7414 11.0141 12.7408 11.4658 12.7118 11.8159C12.6833 12.158 12.6312 12.3431 12.5612 12.4777C12.4094 12.7699 12.1712 13.0082 11.8789 13.16C11.7443 13.2299 11.5593 13.2821 11.2171 13.3105C10.867 13.3396 10.4153 13.3401 9.7587 13.3401H5.65828C5.00167 13.3401 4.54998 13.3396 4.19985 13.3105C3.8577 13.2821 3.67268 13.2299 3.53806 13.16C3.24583 13.0082 3.00756 12.7699 2.85576 12.4777C2.78583 12.3431 2.73365 12.158 2.70523 11.8159C2.67615 11.4658 2.67562 11.0141 2.67562 10.3575V6.25704C2.67562 5.60043 2.67615 5.14873 2.70523 4.7986C2.73365 4.45645 2.78583 4.27143 2.85576 4.13681C3.00756 3.84459 3.24583 3.60631 3.53806 3.45451C3.67268 3.38458 3.8577 3.3324 4.19984 3.30399C4.54997 3.27491 5.00165 3.27437 5.65826 3.27437H8.34949C8.71768 3.27437 9.01616 2.9759 9.01616 2.60771C9.01616 2.23952 8.71768 1.94104 8.34949 1.94104L5.62978 1.94104Z"
                  fill="currentColor"
                />
              </svg>
              <Text color="myGray.900">{t('common:edit')}</Text>
            </MenuItem>
            <MenuItem
              display="flex"
              p="6px 4px"
              alignItems="center"
              gap="8px"
              alignSelf="stretch"
              borderRadius="4px"
              color="myGray.600"
              _hover={{
                bg: 'myGray.50',
                color: 'red.600'
              }}
              onClick={() => deleteChannelMutation.mutate({ id: String(info.row.original.id) })}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M7.48258 1.18025H8.51761C8.84062 1.18024 9.12229 1.18023 9.35489 1.19923C9.60133 1.21937 9.85079 1.26411 10.0921 1.38704C10.4491 1.56894 10.7393 1.85919 10.9212 2.21619C11.0441 2.45745 11.0889 2.70692 11.109 2.95335C11.125 3.14941 11.1275 3.38033 11.1279 3.64149H13.5379C13.9061 3.64149 14.2045 3.93996 14.2045 4.30815C14.2045 4.67634 13.9061 4.97482 13.5379 4.97482H12.9739V11.2268C12.9739 11.7206 12.9739 12.1312 12.9466 12.4663C12.918 12.8153 12.8565 13.1408 12.7001 13.4479C12.4592 13.9206 12.0748 14.305 11.602 14.5459C11.2949 14.7024 10.9695 14.7639 10.6205 14.7924C10.2853 14.8198 9.87475 14.8198 9.381 14.8197H6.61919C6.12544 14.8198 5.71484 14.8198 5.37973 14.7924C5.03069 14.7639 4.70525 14.7024 4.39817 14.5459C3.9254 14.305 3.54102 13.9206 3.30013 13.4479C3.14366 13.1408 3.08215 12.8153 3.05363 12.4663C3.02625 12.1312 3.02626 11.7206 3.02627 11.2268L3.02627 4.97482H2.46232C2.09413 4.97482 1.79565 4.67634 1.79565 4.30815C1.79565 3.93996 2.09413 3.64149 2.46232 3.64149H4.87226C4.87265 3.38033 4.87516 3.14941 4.89118 2.95335C4.91131 2.70692 4.95605 2.45745 5.07899 2.21619C5.26089 1.85919 5.55113 1.56894 5.90813 1.38704C6.1494 1.26411 6.39886 1.21937 6.64529 1.19923C6.8779 1.18023 7.15957 1.18024 7.48258 1.18025ZM4.3596 4.97482V11.1996C4.3596 11.7275 4.36012 12.0833 4.38254 12.3577C4.40432 12.6243 4.44341 12.7547 4.48814 12.8425C4.60119 13.0644 4.7816 13.2448 5.00349 13.3579C5.09128 13.4026 5.22172 13.4417 5.4883 13.4635C5.76267 13.4859 6.11851 13.4864 6.64642 13.4864H9.35377C9.88168 13.4864 10.2375 13.4859 10.5119 13.4635C10.7785 13.4417 10.9089 13.4026 10.9967 13.3579C11.2186 13.2448 11.399 13.0644 11.5121 12.8425C11.5568 12.7547 11.5959 12.6243 11.6176 12.3577C11.6401 12.0833 11.6406 11.7275 11.6406 11.1996V4.97482H4.3596ZM9.79454 3.64149H6.20564C6.20612 3.38305 6.20849 3.20378 6.22008 3.06193C6.23348 2.89795 6.2558 2.84348 6.267 2.82151C6.32106 2.71539 6.40734 2.62912 6.51345 2.57505C6.53543 2.56386 6.58989 2.54154 6.75387 2.52814C6.92563 2.51411 7.15224 2.51359 7.50785 2.51359H8.49234C8.84795 2.51359 9.07456 2.51411 9.24632 2.52814C9.4103 2.54154 9.46476 2.56386 9.48674 2.57505C9.59285 2.62912 9.67913 2.71539 9.73319 2.82151C9.74439 2.84348 9.76671 2.89795 9.78011 3.06193C9.7917 3.20378 9.79407 3.38305 9.79454 3.64149ZM6.76948 7.02568C7.13767 7.02568 7.43614 7.32416 7.43614 7.69235V10.7689C7.43614 11.1371 7.13767 11.4356 6.76948 11.4356C6.40129 11.4356 6.10281 11.1371 6.10281 10.7689V7.69235C6.10281 7.32416 6.40129 7.02568 6.76948 7.02568ZM9.23071 7.02568C9.5989 7.02568 9.89738 7.32416 9.89738 7.69235V10.7689C9.89738 11.1371 9.5989 11.4356 9.23071 11.4356C8.86252 11.4356 8.56404 11.1371 8.56404 10.7689V7.69235C8.56404 7.32416 8.86252 7.02568 9.23071 7.02568Z"
                  fill="currentColor"
                />
              </svg>
              <Text color="myGray.900">{t('common:channel.delete')}</Text>
            </MenuItem>
          </MenuList>
        </Menu>
      )
    })
  ];

  const tableData = useMemo(() => allChannels, [allChannels]);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <Box
      w="full"
      h="full"
      display="flex"
      flexDirection="column"
      gap="24px"
      overflow="hidden"
      id="channel-table-container"
    >
      <TableContainer w="full" flex="1 0 0" minHeight="0" overflowY="auto">
        <Table variant="simple" w="full" size="md">
          <Thead position="sticky" top={0} zIndex={1} bg="white">
            {table.getHeaderGroups().map((headerGroup) => (
              <Tr key={headerGroup.id} height="42px" alignSelf="stretch" bg="myGray.50">
                {headerGroup.headers.map((header, i) => (
                  <Th
                    color="myGray.600"
                    fontSize="xs"
                    key={header.id}
                    border={'none'}
                    // the first th
                    borderTopLeftRadius={i === 0 ? '6px' : '0'}
                    borderBottomLeftRadius={i === 0 ? '6px' : '0'}
                    // the last th
                    borderTopRightRadius={i === headerGroup.headers.length - 1 ? '6px' : '0'}
                    borderBottomRightRadius={i === headerGroup.headers.length - 1 ? '6px' : '0'}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </Th>
                ))}
              </Tr>
            ))}
          </Thead>
          <Tbody>
            {isChannelTypeNamesLoading || (isChannelsLoading && !allChannels.length) ? (
              <Tr height="48px" alignSelf="stretch" border="none">
                <Td
                  h="300px"
                  colSpan={table.getAllColumns().length}
                  textAlign="center"
                  py={4}
                  border="none"
                >
                  <Spinner
                    thickness="4px"
                    speed="0.65s"
                    emptyColor="myGray.100"
                    color="primary.500"
                    size={'lg'}
                  />
                </Td>
              </Tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Tr
                  fontSize="sm"
                  key={row.id}
                  height="48px"
                  alignSelf="stretch"
                  borderBottom="1px solid"
                  _hover={{ bg: 'myGray.50' }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <Td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Td>
                  ))}
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
        {/* sentinel for infinite scroll */}
        <Box ref={sentinelRef} h="20px" display="flex" justifyContent="center" alignItems="center">
          {isFetchingNextPage && (
            <Spinner
              thickness="4px"
              speed="0.65s"
              emptyColor="myGray.100"
              color="primary.500"
              size="sm"
            />
          )}
        </Box>
      </TableContainer>
      <UpdateChannelModal
        isOpen={isOpen}
        onClose={onClose}
        operationType={operationType}
        channelInfo={channelInfo}
      />
    </Box>
  );
}
