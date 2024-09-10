import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { Box, Button, Flex, Grid, useTheme } from '@chakra-ui/react';
import { PromptTemplateItem } from '@fastgpt/global/core/ai/type.d';
import { ModalBody, ModalFooter } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
const PromptTemplate = ({
  title,
  templates,
  onClose,
  onSuccess
}: {
  title: string;
  templates: PromptTemplateItem[];
  onClose: () => void;
  onSuccess: (e: PromptTemplateItem) => void;
}) => {
  const theme = useTheme();
  const [selectTemplateTitle, setSelectTemplateTitle] = useState<PromptTemplateItem>();
  const { t } = useTranslation();
  return (
    <MyModal isOpen title={title} onClose={onClose} iconSrc="/imgs/modal/prompt.svg">
      <ModalBody h="100%" w={'600px'} maxW={'90vw'} overflowY={'auto'}>
        <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gridGap={4}>
          {templates.map((item) => (
            <Box
              key={item.title}
              border={theme.borders.base}
              py={2}
              px={2}
              borderRadius={'md'}
              cursor={'pointer'}
              {...(item.title === selectTemplateTitle?.title
                ? {
                    bg: 'primary.50'
                  }
                : {})}
              onClick={() => setSelectTemplateTitle(item)}
            >
              <Box color={'myGray.900'}>{t(item.title as any)}</Box>

              <Box color={'myGray.500'} fontSize={'xs'} whiteSpace={'pre-wrap'}>
                {t(item.desc as any)}
              </Box>
            </Box>
          ))}
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button
          disabled={!selectTemplateTitle}
          onClick={() => {
            if (!selectTemplateTitle) return;
            onSuccess(selectTemplateTitle);
            onClose();
          }}
        >
          {t('common:confirm_choice')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default PromptTemplate;
