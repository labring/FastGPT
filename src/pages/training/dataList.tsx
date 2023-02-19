import React from 'react';
import { Card, Box, Flex, Button } from '@chakra-ui/react';

const TrainDataList = () => {
  return (
    <>
      <Card px={6} py={4}>
        <Flex alignItems={'center'}>
          <Box fontSize={'xl'} fontWeight={'bold'} flex={1}>
            训练数据管理
          </Box>
          <Button variant={'outline'} mr={6}>
            导入数据
          </Button>
          <Button>插入一条数据</Button>
        </Flex>
      </Card>
      {/* 数据表 */}
    </>
  );
};

export default TrainDataList;
