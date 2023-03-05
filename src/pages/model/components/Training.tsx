import React, { useEffect, useCallback, useState } from 'react';
import { Box, TableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@chakra-ui/react';
import { ModelType } from '@/types/model';
import { getModelTrainings } from '@/api/model';
import type { TrainingItemType } from '@/types/training';

const Training = ({ model }: { model: ModelType }) => {
  const columns: {
    title: string;
    key: keyof TrainingItemType;
    dataIndex: string;
  }[] = [
    {
      title: '训练ID',
      key: 'tuneId',
      dataIndex: 'tuneId'
    },
    {
      title: '状态',
      key: 'status',
      dataIndex: 'status'
    }
  ];

  const [records, setRecords] = useState<TrainingItemType[]>([]);

  const loadTrainingRecords = useCallback(async (id: string) => {
    try {
      const res = await getModelTrainings(id);
      setRecords(res);
    } catch (error) {
      console.log(error);
    }
  }, []);

  useEffect(() => {
    model._id && loadTrainingRecords(model._id);
  }, [loadTrainingRecords, model]);

  return (
    <>
      <Box fontWeight={'bold'} fontSize={'lg'}>
        训练记录: {model.trainingTimes}次
      </Box>
      <TableContainer mt={4}>
        <Table variant={'simple'}>
          <Thead>
            <Tr>
              {columns.map((item) => (
                <Th key={item.key}>{item.title}</Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {records.map((item) => (
              <Tr key={item._id}>
                {columns.map((col) => (
                  // @ts-ignore
                  <Td key={col.key}>{item[col.dataIndex]}</Td>
                ))}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </>
  );
};

export default Training;
