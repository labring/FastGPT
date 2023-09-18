import React, { useMemo } from 'react';
import { Box, ModalBody, useTheme, Flex } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@/types/chat';
import { useTranslation } from 'react-i18next';

import MyModal from '../MyModal';
import MyTooltip from '../MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';

const ResponseModal = ({
  response,
  onClose
}: {
  response: ChatHistoryItemResType[];
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const formatResponse = useMemo(
    () =>
      response.map((item) => {
        const copy = { ...item };
        delete copy.completeMessages;
        delete copy.quoteList;
        return copy;
      }),
    [response]
  );

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      h={['90vh', '80vh']}
      minW={['90vw', '600px']}
      title={
        <Flex alignItems={'center'}>
          {t('chat.Complete Response')}
          <MyTooltip
            label={
              'moduleName: 模型名\nprice: 价格，倍率：100000\nmodel?: 模型名\ntokens?: token 消耗\n\nanswer?: 回答内容\nquestion?: 问题\ntemperature?: 温度\nmaxToken?: 最大 tokens\n\nsimilarity?: 相似度\nlimit?: 单次搜索结果\n\ncqList?: 问题分类列表\ncqResult?: 分类结果\n\nextractDescription?: 内容提取描述\nextractResult?: 提取结果'
            }
          >
            <QuestionOutlineIcon ml={2} />
          </MyTooltip>
        </Flex>
      }
      isCentered
    >
      <ModalBody>
        {formatResponse.map((item, i) => (
          <Box
            key={i}
            p={2}
            pt={[0, 2]}
            borderRadius={'lg'}
            border={theme.borders.base}
            _notLast={{ mb: 2 }}
            position={'relative'}
            whiteSpace={'pre-wrap'}
          >
            {JSON.stringify(item, null, 2)}
          </Box>
        ))}
      </ModalBody>
    </MyModal>
  );
};

export default ResponseModal;
