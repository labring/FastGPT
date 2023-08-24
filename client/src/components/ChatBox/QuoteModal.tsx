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
   * click edit, get new kbDataItem
   */
  const onclickEdit = useCallback(
    async (item: SearchType) => {
      if (!item.id) return;
      try {
        setIsLoading(true);
        const data = (await getKbDataItemById(item.id)) as QuoteItemType;

        if (!data) {
          onUpdateQuote(item.id, '已删除');
          throw new Error('该数据已被删除');
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
            知识库引用({rawSearch.length}条)
            <Box fontSize={['xs', 'sm']} fontWeight={'normal'}>
              注意: 修改知识库内容成功后，此处不会显示变更情况。点击编辑后，会显示知识库最新的内容。
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
              overflow={'hidden'}
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
                    onClick={() => onclickEdit(item)}
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
          onSuccess={() => onUpdateQuote(editDataItem.dataId, '手动修改')}
          onDelete={() => onUpdateQuote(editDataItem.dataId, '已删除')}
          kbId={editDataItem.kbId}
          defaultValues={editDataItem}
        />
      )}
    </>
  );
};

export default QuoteModal;
