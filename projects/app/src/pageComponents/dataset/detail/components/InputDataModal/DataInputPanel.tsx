import React from 'react';
import { Box, Button, Flex, Spinner, Textarea, type TextareaProps } from '@chakra-ui/react';
import type { UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyImage from '@/components/MyImage/index';
import { TabEnum, type InputDataType } from './useInputDataModal';

const dataTextareaProps: TextareaProps = {
  resize: 'both',
  flex: '1 0 0',
  bg: 'white',
  borderRadius: '6px',
  border: '1px solid',
  borderColor: 'borderColor.low',
  p: '8px 12px',
  color: 'myGray.900',
  _focus: {
    borderColor: 'primary.500',
    boxShadow: 'focus',
    bg: 'white'
  },
  sx: {
    '&::-webkit-scrollbar-thumb': {
      background: 'var(--chakra-colors-myGray-150) !important',
      transition: 'background 1s',
      marginLeft: '5px'
    },
    '&::-webkit-scrollbar-thumb:hover': {
      background: 'var(--chakra-colors-myGray-250) !important'
    }
  }
};

const getDataTextareaProps = (canWrite: boolean): TextareaProps => ({
  ...dataTextareaProps,
  isReadOnly: !canWrite,
  cursor: canWrite ? 'text' : 'default',
  _readOnly: {
    bg: 'myGray.25',
    color: 'myGray.600'
  }
});

const DataInputPanel = ({
  canWrite,
  currentTab,
  imagePreivewUrl,
  isImporting,
  isUpdating,
  isIndexEditing,
  register,
  submitData
}: {
  canWrite: boolean;
  currentTab?: TabEnum;
  imagePreivewUrl?: string;
  isImporting: boolean;
  isUpdating: boolean;
  isIndexEditing: boolean;
  register: UseFormRegister<InputDataType>;
  submitData: () => void;
}) => {
  const { t } = useTranslation();
  const textareaProps = getDataTextareaProps(canWrite);
  const isSubmitting = isImporting || isUpdating;
  const isSubmitDisabled = !canWrite || isIndexEditing;
  const iconColor = isSubmitDisabled ? 'myGray.400' : 'primary.600';

  return (
    <Flex
      flexDir={'column'}
      gap={'8px'}
      flex={'1 0 0'}
      w={['100%', 0]}
      overflow={['unset', 'auto']}
    >
      <Flex
        flexDir={'column'}
        flex={currentTab === TabEnum.image ? '0 0 201px' : '1 0 0'}
        h={currentTab === TabEnum.image ? '201px' : 0}
        minH={0}
        gap={'8px'}
      >
        {currentTab === TabEnum.image && (
          <>
            <FormLabel required h={'32px'} py={'6px'}>
              {t('file:image')}
            </FormLabel>
            <Box flex={'1 0 0'} h={0} w="100%">
              <Box
                height="100%"
                position="relative"
                border={'1px solid'}
                borderColor={'borderColor.low'}
                borderRadius={'6px'}
                bg={'myGray.25'}
                p={'8px'}
              >
                <MyImage
                  src={imagePreivewUrl}
                  h="100%"
                  w="100%"
                  objectFit="cover"
                  borderRadius={'2px'}
                  alt={t('file:Image_Preview')}
                />
              </Box>
            </Box>
          </>
        )}
        {(currentTab === TabEnum.chunk || currentTab === TabEnum.qa) && (
          <>
            <FormLabel required h={'20px'}>
              {currentTab === TabEnum.chunk
                ? t('common:dataset_data_input_chunk_content')
                : t('common:dataset_data_input_q')}
            </FormLabel>

            <Textarea
              {...textareaProps}
              {...register(`q`, {
                required: true
              })}
            />
          </>
        )}
      </Flex>
      {currentTab === TabEnum.qa && (
        <Flex flexDir={'column'} flex={'1 0 0'} h={0} minH={0} gap={'8px'}>
          <FormLabel required h={'20px'}>
            {t('common:dataset_data_input_a')}
          </FormLabel>
          <Textarea {...textareaProps} {...register('a', { required: true })} />
        </Flex>
      )}
      {currentTab === TabEnum.image && (
        <Flex flexDir={'column'} flex={'1 0 0'} h={0} minH={0} gap={'8px'}>
          <FormLabel required h={'32px'} py={'6px'}>
            {t('file:image_description')}
          </FormLabel>
          <Textarea
            {...textareaProps}
            placeholder={t('file:image_description_tip')}
            {...register('q', {
              required: true
            })}
          />
        </Flex>
      )}
      <Button
        h={'32px'}
        minH={'32px'}
        w={'100%'}
        bg={'myGray.150'}
        color={'primary.700'}
        borderRadius={'6px'}
        fontSize={'12px'}
        lineHeight={'16px'}
        fontWeight={'500'}
        letterSpacing={'0.5px'}
        _hover={{ bg: 'myGray.200' }}
        _disabled={{
          bg: 'myGray.100',
          color: 'myGray.400',
          cursor: 'not-allowed',
          opacity: 1,
          _hover: {
            bg: 'myGray.100'
          }
        }}
        rightIcon={
          isSubmitting ? (
            <Spinner w={'16px'} h={'16px'} color={iconColor} />
          ) : (
            <MyIcon name={'common/rightArrowLight'} w={'16px'} color={iconColor} />
          )
        }
        isDisabled={isSubmitDisabled}
        aria-busy={isSubmitting}
        onClick={() => {
          if (isSubmitting || isSubmitDisabled) return;
          submitData();
        }}
      >
        {t('dataset:generate_index')}
      </Button>
    </Flex>
  );
};

export default React.memo(DataInputPanel);
