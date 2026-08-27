import { useState } from 'react';
import { GET } from '@/web/admin/common/request';
import { Box, Button, Center, Spinner, useDisclosure } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import React from 'react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';

type TMember = {
  userName: string;
  role: number;
  status: number;
};

const columnHelper = createColumnHelper<TMember>();

const columns = [
  columnHelper.accessor('userName', {
    header: () => '用户名',
    cell: (info) => info.renderValue()
  }),
  columnHelper.accessor('role', {
    header: () => '权限',
    cell: (info) => info.renderValue()
  }),
  columnHelper.accessor('status', {
    header: () => '状态',
    cell: (info) => info.renderValue()
  })
];

export default function DetailTeamModal(props: { teamId: string }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { teamId } = props;
  const [data, setData] = useState([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel()
  } as any);

  const { isLoading } = useQuery(
    ['getTeams', teamId],
    () => {
      return GET('/proApi/admin/routes/teams/getTeamMembers', { teamId });
    },
    {
      onSuccess: (res: any) => {
        setData(res.members);
      },
      enabled: isOpen
    }
  );

  return (
    <>
      <Button
        variant={'whiteBase'}
        size={'sm'}
        onClick={() => {
          onOpen();
        }}
      >
        详情
      </Button>
      <MyModal isOpen={isOpen} onClose={onClose} maxW={['90vw', '700px']} title={'团队详情'}>
        {isLoading ? (
          <Center h="100%">
            <Spinner />
          </Center>
        ) : (
          <>
            <Box as="table" w="full" borderRadius="lg" mt={2}>
              <Box as="thead" h={10}>
                {table.getHeaderGroups().map((headerGroup) => (
                  <Box as="tr" key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <Box
                        as="th"
                        key={header.id}
                        textAlign="left"
                        pl={2}
                        color="#132047"
                        fontWeight="bold"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <Box
                    as="tr"
                    key={row.id}
                    _hover={{
                      filter:
                        'drop-shadow(0 10px 8px rgba(0,0,0,0.04)) drop-shadow(0 4px 3px rgba(0,0,0,0.1))'
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <Box as="td" key={cell.id} pl={2} h={12} fontWeight="medium">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </Box>
                    ))}
                  </Box>
                ))}
              </tbody>
            </Box>
          </>
        )}
      </MyModal>
    </>
  );
}
