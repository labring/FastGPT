import React, { useCallback, useState } from 'react';
import { ModalBody, Box, useTheme } from '@chakra-ui/react';
import { getKbDataItemById } from '@/api/plugins/kb';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/useToast';
import { getErrText } from '@/utils/tools';
import { QuoteItemType } from '@/types/chat';
import MyIcon from '@/components/Icon';
import InputDataModal from '@/pages/kb/detail/components/InputDataModal';
import MyModal from '../MyModal';

type SearchType = {
  kb_id?: string;
  id?: string;
  q: string;
  a?: string;
  source?: string | undefined;
};

const QuoteModal = ({
  onUpdateQuote,
  rawSearch = [],
  onClose
}: {
  onUpdateQuote: (quoteId: string, sourceText: string) => Promise<void>;
  rawSearch: SearchType[];
  onClose: () => void;
}) => {
  const theme = useTheme();
  const { toast } = useToast();
  const { setIsLoading, Loading } = useLoading();
  const [editDataItem, setEditDataItem] = useState<{
    kbId: string;
    dataId: string;
    a: string;
    q: string;
  }>();

  /**
   * Click edit, get new kbDataItem
   */
  const onClickEdit = useCallback(
    async (item: SearchType) => {
      if (!item.id) return;
      try {
        setIsLoading(true);
        const data = (await getKbDataItemById(item.id)) as QuoteItemType;

        if (!data) {
          onUpdateQuote(item.id, 'Deleted');
          throw new Error('This data has been deleted');
        }

        setEditDataItem({
          kbId: data.kb_id,
          dataId: data.id,
          q: data.q,
          a: data.a
        });
      } catch (err) {
        toast({
          status: 'warning',
          title: getErrText(err)
        });
      }
      setIsLoading(false);
    },
    [setIsLoading, toast, onUpdateQuote]
  );

  return (
    <>
      <MyModal
        isOpen={true}
        onClose={onClose}
        h={['90vh', '80vh']}
        isCentered
        minW={['90vw', '600px']}
        title={
          <>
            Knowledge Base References ({rawSearch.length} records)
            <Box fontSize={['xs', 'sm']} fontWeight={'normal'}>
              Note: After modifying knowledge base content successfully, changes won't be reflected here. Click "Edit" to display the latest content from the knowledge base.
            </Box>
          </>
        }
      >
        <ModalBody pt={0} whiteSpace={'pre-wrap'} textAlign={'justify'} fontSize={'sm'}>
          {rawSearch.map((item, i) => (
            <Box
              key={i}
              flex={'1 0 0'}
              p={2}
              borderRadius={'lg'}
              border={theme.borders.base}
              _notLast={{ mb: 2 }}
              position={'relative'}
              _hover={{ '& .edit': { display: 'flex' } }}
            >
              {item.source && <Box color={'myGray.600'}>({item.source})</Box>}
              <Box>{item.q}</Box>
              <Box>{item.a}</Box>
              {item.id && (
                <Box
                  className="edit"
                  display={'none'}
                  position={'absolute'}
                  right={0}
                  top={0}
                  bottom={0}
                  w={'40px'}
                  bg={'rgba(255,255,255,0.9)'}
                  alignItems={'center'}
                  justifyContent={'center'}
                  boxShadow={'-10px 0 10px rgba(255,255,255,1)'}
                >
                  <MyIcon
                    name={'edit'}
                    w={'18px'}
                    h={'18px'}
                    cursor={'pointer'}
                    color={'myGray.600'}
                    _hover={{
                      color: 'myBlue.700'
                    }}
                    onClick={() => onClickEdit(item)}
                  />
                </Box>
              )}
            </Box>
          ))}
        </ModalBody>
        <Loading fixed={false} />
      </MyModal>
      {editDataItem && (
        <InputDataModal
          onClose={() => setEditDataItem(undefined)}
          onSuccess={() => onUpdateQuote(editDataItem.dataId, 'Manually Modified')}
          onDelete={() => onUpdateQuote(editDataItem.dataId, 'Deleted')}
          kbId={editDataItem.kbId}
          defaultValues={editDataItem}
        />
      )}
    </>
  );
};

export default QuoteModal;
