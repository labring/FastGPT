import React from 'react';
import {
  Box,
  Flex,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon
} from '@chakra-ui/react';
import { getInforms, readInform } from '@/api/user';
import { usePagination } from '@/hooks/usePagination';
import { useLoading } from '@/hooks/useLoading';
import type { informSchema } from '@/types/mongoSchema';
import { formatTimeToChatTime } from '@/utils/tools';
import MyIcon from '@/components/Icon';

const BillTable = () => {
  const { Loading } = useLoading();

  const {
    data: informs,
    isLoading,
    total,
    pageSize,
    Pagination,
    getData,
    pageNum
  } = usePagination<informSchema>({
    api: getInforms
  });

  return (
    <Box mt={2}>
      <Accordion defaultIndex={[0, 1, 2]} allowMultiple>
        {informs.map((item) => (
          <AccordionItem
            key={item._id}
            onClick={async () => {
              if (!item.read) {
                await readInform(item._id);
                getData(pageNum);
              }
            }}
          >
            <AccordionButton>
              <Flex alignItems={'center'} flex="1" textAlign="left">
                <Box fontWeight={'bold'} position={'relative'}>
                  {!item.read && (
                    <Box
                      w={'5px'}
                      h={'5px'}
                      borderRadius={'10px'}
                      bg={'myRead.600'}
                      position={'absolute'}
                      top={1}
                      left={'-5px'}
                    ></Box>
                  )}
                  {item.title}
                </Box>
                <Box ml={2} color={'myGray.500'}>
                  {formatTimeToChatTime(item.time)}
                </Box>
              </Flex>

              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pb={4}>{item.content}</AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
      {!isLoading && informs.length === 0 && (
        <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'100px'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            暂无通知~
          </Box>
        </Flex>
      )}
      {total > pageSize && (
        <Flex w={'100%'} mt={4} justifyContent={'flex-end'}>
          <Pagination />
        </Flex>
      )}
      <Loading loading={isLoading && informs.length === 0} fixed={false} />
    </Box>
  );
};

export default BillTable;
