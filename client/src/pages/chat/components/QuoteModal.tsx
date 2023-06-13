import React, { useCallback, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  ModalHeader,
  Box,
  useTheme
} from '@chakra-ui/react';
import { QuoteItemType } from '@/pages/api/openapi/kb/appKbSearch';
import MyIcon from '@/components/Icon';
import InputDataModal from '@/pages/kb/components/InputDataModal';
import { getKbDataItemById } from '@/api/plugins/kb';
import { useLoading } from '@/hooks/useLoading';
import { useQuery } from '@tanstack/react-query';
import { getHistoryQuote, updateHistoryQuote } from '@/api/chat';
import { useToast } from '@/hooks/useToast';
import { getErrText } from '@/utils/tools';

const QuoteModal = ({
  historyId,
  chatId,
  onClose
}: {
  historyId: string;
  chatId: string;
  onClose: () => void;
}) => {
  const theme = useTheme();
  const { toast } = useToast();
  const { setIsLoading, Loading } = useLoading();
  const [editDataItem, setEditDataItem] = useState<{
    dataId: string;
    a: string;
    q: string;
  }>();

  const {
    data: quote = [],
    refetch,
    isLoading
  } = useQuery(['getHistoryQuote'], () => getHistoryQuote({ historyId, chatId }));

  /**
   * update kbData, update mongo status and reload quotes
   */
  const updateQuoteStatus = useCallback(
    async (quoteId: string, sourceText: string) => {
      setIsLoading(true);
      try {
        await updateHistoryQuote({
          chatId,
          historyId,
          quoteId,
          sourceText
        });
        // reload quote
        refetch();
      } catch (err) {
        toast({
          status: 'warning',
          title: getErrText(err)
        });
      }
      setIsLoading(false);
    },
    [chatId, historyId, refetch, setIsLoading, toast]
  );

  /**
   * click edit, get new kbDataItem
   */
  const onclickEdit = useCallback(
    async (item: QuoteItemType) => {
      try {
        setIsLoading(true);
        const data = (await getKbDataItemById(item.id)) as QuoteItemType;

        if (!data) {
          updateQuoteStatus(item.id, '已删除');
          throw new Error('该数据已被删除');
        }

        setEditDataItem({
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
    [setIsLoading, toast, updateQuoteStatus]
  );

  return (
    <>
      <Modal isOpen={true} onClose={onClose}>
        <ModalOverlay />
        <ModalContent
          position={'relative'}
          maxW={'min(90vw, 700px)'}
          h={'80vh'}
          overflow={'overlay'}
        >
          <ModalHeader>
            知识库引用({quote.length}条)
            <Box fontSize={'sm'} fontWeight={'normal'}>
              注意: 修改知识库内容成功后，此处不会显示。点击编辑后，才是显示最新的内容。
            </Box>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pt={0} whiteSpace={'pre-wrap'} textAlign={'justify'} fontSize={'sm'}>
            {quote.map((item) => (
              <Box
                key={item.id}
                flex={'1 0 0'}
                p={2}
                borderRadius={'sm'}
                border={theme.borders.base}
                _notLast={{ mb: 2 }}
                position={'relative'}
                _hover={{ '& .edit': { display: 'flex' } }}
              >
                {item.source && <Box color={'myGray.600'}>({item.source})</Box>}
                <Box>{item.q}</Box>
                <Box>{item.a}</Box>
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
              </Box>
            ))}
          </ModalBody>
          <Loading loading={isLoading} fixed={false} />
        </ModalContent>
      </Modal>
      {editDataItem && (
        <InputDataModal
          onClose={() => setEditDataItem(undefined)}
          onSuccess={() => updateQuoteStatus(editDataItem.dataId, '手动修改')}
          onDelete={() => updateQuoteStatus(editDataItem.dataId, '已删除')}
          kbId=""
          defaultValues={editDataItem}
        />
      )}
    </>
  );
};

export default QuoteModal;
