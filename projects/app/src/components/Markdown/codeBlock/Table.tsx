import React, { useState, useMemo } from 'react';
import { Box, Flex, Text, Grid } from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

const TableBlock: React.FC<{ code: string }> = ({ code }) => {
  const { t } = useSafeTranslation();
  const tableData = JSON.parse(code);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const headers = Object.keys(tableData[0]);

  // calculate paginated data
  const { paginatedData, totalPages } = useMemo(() => {
    const total = Math.ceil(tableData.length / perPage);
    const startIndex = (currentPage - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginated = tableData.slice(startIndex, endIndex);

    return {
      paginatedData: paginated,
      totalPages: total
    };
  }, [tableData, currentPage, perPage]);

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePerPageChange = (value: string) => {
    setPerPage(Number(value));
    setCurrentPage(1); // reset to first page
  };

  return (
    <Box my={4}>
      <Flex overflowX="auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
          <thead>
            <tr style={{ backgroundColor: '#f7fafc' }}>
              {headers.map((header, index) => (
                <th
                  key={index}
                  style={{
                    padding: '12px',
                    border: '1px solid #e2e8f0',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row: any, rowIndex: number) => (
              <tr
                key={rowIndex}
                style={{ backgroundColor: rowIndex % 2 === 0 ? '#ffffff' : '#f9f9f9' }}
              >
                {headers.map((header, colIndex) => (
                  <td
                    key={colIndex}
                    style={{
                      padding: '12px',
                      border: '1px solid #e2e8f0',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {row[header] || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Flex>

      <Grid width="full" gridTemplateColumns="1fr auto 1fr" alignItems="center" gap={4}>
        <Flex gap={1} align="center" gridColumn="2">
          <Icon
            name="core/chat/chevronLeft"
            w="16px"
            height="16px"
            cursor={currentPage === 1 ? 'not-allowed' : 'pointer'}
            opacity={currentPage === 1 ? 0.5 : 1}
            onClick={currentPage === 1 ? undefined : handlePrevPage}
          />
          <Text>
            {currentPage} / {totalPages}
          </Text>
          <Icon
            name="core/chat/chevronRight"
            w="16px"
            height="16px"
            cursor={currentPage === totalPages ? 'not-allowed' : 'pointer'}
            opacity={currentPage === totalPages ? 0.5 : 1}
            onClick={currentPage === totalPages ? undefined : handleNextPage}
          />
        </Flex>

        {totalPages > 1 && (
          <Flex gridColumn="3">
            <MySelect
              value={perPage.toString()}
              onChange={handlePerPageChange}
              list={[
                { label: t('common:core.chat.table.per_page', { num: 5 }), value: '5' },
                {
                  label: t('common:core.chat.table.per_page', { num: 10 }),
                  value: '10'
                },
                {
                  label: t('common:core.chat.table.per_page', { num: 20 }),
                  value: '20'
                },
                {
                  label: t('common:core.chat.table.per_page', { num: 50 }),
                  value: '50'
                },
                {
                  label: t('common:core.chat.table.per_page', { num: 100 }),
                  value: '100'
                }
              ]}
            />
          </Flex>
        )}
      </Grid>
    </Box>
  );
};

export default TableBlock;
