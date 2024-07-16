import React, { useMemo } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import 'katex/dist/katex.min.css';
import ChatBoxDivider from '@/components/core/chat/Divider';
import { useTranslation } from 'next-i18next';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';

const QuestionGuide = ({ text }: { text: string }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const questionGuides = useMemo(() => {
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json) && !json.find((item) => typeof item !== 'string')) {
        return json as string[];
      }
      return [];
    } catch (error) {
      return [];
    }
  }, [text]);

  return questionGuides.length > 0 ? (
    <Box mt={2}>
      <ChatBoxDivider icon="core/chat/QGFill" text={t('common:core.chat.Question Guide')} />
      <Flex alignItems={'center'} flexWrap={'wrap'} gap={2}>
        {questionGuides.map((text) => (
          <Flex
            key={text}
            alignItems={'center'}
            flexWrap={'wrap'}
            fontSize={'xs'}
            border={theme.borders.sm}
            py={'1px'}
            px={3}
            borderRadius={'md'}
            _hover={{
              '.controller': {
                display: 'flex'
              }
            }}
            overflow={'hidden'}
            position={'relative'}
          >
            <Box className="textEllipsis" flex={'1 0 0'}>
              {text}
            </Box>
            <Box
              className="controller"
              display={'none'}
              pr={2}
              position={'absolute'}
              right={0}
              left={0}
              justifyContent={'flex-end'}
              alignItems={'center'}
              h={'100%'}
              lineHeight={0}
              bg={`linear-gradient(to left, white,white min(60px,100%),rgba(255,255,255,0) 80%)`}
            >
              <MyTooltip label={t('common:core.chat.markdown.Edit Question')}>
                <MyIcon
                  name={'edit'}
                  w={'14px'}
                  cursor={'pointer'}
                  _hover={{
                    color: 'green.600'
                  }}
                  onClick={() => eventBus.emit(EventNameEnum.editQuestion, { text })}
                />
              </MyTooltip>
              <MyTooltip label={t('common:core.chat.markdown.Send Question')}>
                <MyIcon
                  ml={4}
                  name={'core/chat/sendLight'}
                  w={'14px'}
                  cursor={'pointer'}
                  _hover={{ color: 'primary.500' }}
                  onClick={() => eventBus.emit(EventNameEnum.sendQuestion, { text })}
                />
              </MyTooltip>
            </Box>
          </Flex>
        ))}
      </Flex>
    </Box>
  ) : null;
};

export default React.memo(QuestionGuide);
