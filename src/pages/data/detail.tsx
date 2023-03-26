import React from 'react';
import { Box, Card } from '@chakra-ui/react';
import ScrollData from '@/components/ScrollData';
import { getDataItems } from '@/api/data';
import { usePaging } from '@/hooks/usePaging';
import type { DataItemSchema } from '@/types/mongoSchema';

const DataDetail = ({ dataName, dataId }: { dataName: string; dataId: string }) => {
  const {
    nextPage,
    isLoadAll,
    requesting,
    data: dataItems
  } = usePaging<DataItemSchema>({
    api: getDataItems,
    pageSize: 10,
    params: {
      dataId
    }
  });

  return (
    <Card py={4} h={'100%'} display={'flex'} flexDirection={'column'}>
      <Box px={6} fontSize={'xl'} fontWeight={'bold'}>
        {dataName} 结果
      </Box>
      <ScrollData
        flex={'1 0 0'}
        h={0}
        px={6}
        mt={3}
        isLoadAll={isLoadAll}
        requesting={requesting}
        nextPage={nextPage}
        fontSize={'xs'}
      >
        {dataItems.map((item) => (
          <Box key={item._id}>
            {item.result.map((result, i) => (
              <Box key={i} mb={3}>
                {item.type === 'QA' && (
                  <>
                    <Box fontWeight={'bold'}>Q: {result.q}</Box>
                    <Box>A: {result.a}</Box>
                  </>
                )}
                {item.type === 'abstract' && <Box fontSize={'sm'}>{result.abstract}</Box>}
              </Box>
            ))}
          </Box>
        ))}
      </ScrollData>
    </Card>
  );
};

export default DataDetail;

export async function getServerSideProps(context: any) {
  return {
    props: {
      dataName: context.query?.dataName || '',
      dataId: context.query?.dataId || ''
    }
  };
}
