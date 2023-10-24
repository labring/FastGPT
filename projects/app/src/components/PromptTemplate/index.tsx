import React, { useState } from 'react';
import MyModal from '../MyModal';
import { Box, Button, Grid, useTheme } from '@chakra-ui/react';
import { PromptTemplateItem } from '@fastgpt/global/core/ai/type.d';
import { ModalBody, ModalFooter } from '@chakra-ui/react';

const PromptTemplate = ({
  title,
  templates,
  onClose,
  onSuccess
}: {
  title: string;
  templates: PromptTemplateItem[];
  onClose: () => void;
  onSuccess: (e: string) => void;
}) => {
  const theme = useTheme();
  const [selectTemplateTitle, setSelectTemplateTitle] = useState<PromptTemplateItem>();

  return (
    <MyModal isOpen title={title} onClose={onClose}>
      <ModalBody w={'600px'}>
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
                    bg: 'myBlue.100'
                  }
                : {})}
              onClick={() => setSelectTemplateTitle(item)}
            >
              <Box>{item.title}</Box>
              <Box color={'myGray.600'} fontSize={'sm'} whiteSpace={'pre-wrap'}>
                {item.value}
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
            onSuccess(selectTemplateTitle.value);
            onClose();
          }}
        >
          确认选择
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default PromptTemplate;
