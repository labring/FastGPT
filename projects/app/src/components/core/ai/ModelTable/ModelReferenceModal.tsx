import {
  Box,
  Button,
  ModalBody,
  ModalFooter,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import type { ModelReference } from '@fastgpt/service/support/permission/model/reference';

const ModelReferenceModal = ({
  isOpen,
  references,
  onClose
}: {
  isOpen: boolean;
  references: ModelReference[];
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <MyModal isOpen={isOpen} onClose={onClose} title={t('common:Notice')} maxW="400px">
      <ModalBody px={7}>
        <Box fontSize="14px" color="myGray.700" mb={4}>
          {t('account_model:model_referenced_by_resources')}
        </Box>
        <TableContainer maxH="400px" overflowY="auto">
          <Table fontSize="sm">
            <Thead>
              <Tr>
                <Th>{t('common:resource_type')}</Th>
                <Th>{t('common:resource_name')}</Th>
                <Th>{t('common:creator')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {references.map((ref, i) => (
                <Tr key={i}>
                  <Td>
                    {ref.resourceType === 'app'
                      ? t('app:application')
                      : t('common:core.dataset.Dataset')}
                  </Td>
                  <Td>{ref.resourceName}</Td>
                  <Td>{ref.creatorName}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </ModalBody>
      <ModalFooter px={6} pt={2}>
        <Button variant="whiteBase" onClick={onClose}>
          {t('common:Cancel')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ModelReferenceModal;
