import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import React, { useCallback, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Flex, FlexProps, Grid, ModalBody, Switch, useTheme } from '@chakra-ui/react';
import MyRadio from '@/components/common/MyRadio';
import { useForm } from 'react-hook-form';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { fileToBase64 } from '@/web/common/file/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { subRoute } from '@fastgpt/web/common/system/utils';

enum UsingWayEnum {
  link = 'link',
  iframe = 'iframe',
  script = 'script'
}

const SelectUsingWayModal = ({ share, onClose }: { share: OutLinkSchema; onClose: () => void }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { copyData } = useCopyData();
  const { File, onOpen } = useSelectFile({
    multiple: false,
    fileType: 'image/*'
  });
  const { feConfigs } = useSystemStore();

  const VariableTypeList = [
    {
      title: <MyImage src={'/imgs/outlink/link.svg'} alt={''} />,
      value: UsingWayEnum.link
    },
    {
      title: <MyImage src={'/imgs/outlink/iframe.svg'} alt={''} />,
      value: UsingWayEnum.iframe
    },
    {
      title: <MyImage src={'/imgs/outlink/script.svg'} alt={''} />,
      value: UsingWayEnum.script
    }
  ];

  const [refresh, setRefresh] = useState(false);

  const { getValues, setValue, register, watch } = useForm({
    defaultValues: {
      usingWay: UsingWayEnum.link,
      showHistory: true,
      scriptIconCanDrag: false,
      scriptDefaultOpen: false,
      scriptOpenIcon:
        'data:image/svg+xml;base64,PHN2ZyB0PSIxNjkwNTMyNzg1NjY0IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjQxMzIiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIj48cGF0aCBkPSJNNTEyIDMyQzI0Ny4wNCAzMiAzMiAyMjQgMzIgNDY0QTQxMC4yNCA0MTAuMjQgMCAwIDAgMTcyLjQ4IDc2OEwxNjAgOTY1LjEyYTI1LjI4IDI1LjI4IDAgMCAwIDM5LjA0IDIyLjRsMTY4LTExMkE1MjguNjQgNTI4LjY0IDAgMCAwIDUxMiA4OTZjMjY0Ljk2IDAgNDgwLTE5MiA0ODAtNDMyUzc3Ni45NiAzMiA1MTIgMzJ6IG0yNDQuOCA0MTZsLTM2MS42IDMwMS43NmExMi40OCAxMi40OCAwIDAgMS0xOS44NC0xMi40OGw1OS4yLTIzMy45MmgtMTYwYTEyLjQ4IDEyLjQ4IDAgMCAxLTcuMzYtMjMuMzZsMzYxLjYtMzAxLjc2YTEyLjQ4IDEyLjQ4IDAgMCAxIDE5Ljg0IDEyLjQ4bC01OS4yIDIzMy45MmgxNjBhMTIuNDggMTIuNDggMCAwIDEgOCAyMi4wOHoiIGZpbGw9IiM0ZTgzZmQiIHAtaWQ9IjQxMzMiPjwvcGF0aD48L3N2Zz4=',
      scriptCloseIcon:
        'data:image/svg+xml;base64,PHN2ZyB0PSIxNjkwNTM1NDQxNTI2IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjYzNjciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIj48cGF0aCBkPSJNNTEyIDEwMjRBNTEyIDUxMiAwIDEgMSA1MTIgMGE1MTIgNTEyIDAgMCAxIDAgMTAyNHpNMzA1Ljk1NjU3MSAzNzAuMzk1NDI5TDQ0Ny40ODggNTEyIDMwNS45NTY1NzEgNjUzLjYwNDU3MWE0NS41NjggNDUuNTY4IDAgMSAwIDY0LjQzODg1OCA2NC40Mzg4NThMNTEyIDU3Ni41MTJsMTQxLjYwNDU3MSAxNDEuNTMxNDI5YTQ1LjU2OCA0NS41NjggMCAwIDAgNjQuNDM4ODU4LTY0LjQzODg1OEw1NzYuNTEyIDUxMmwxNDEuNTMxNDI5LTE0MS42MDQ1NzFhNDUuNTY4IDQ1LjU2OCAwIDEgMC02NC40Mzg4NTgtNjQuNDM4ODU4TDUxMiA0NDcuNDg4IDM3MC4zOTU0MjkgMzA1Ljk1NjU3MWE0NS41NjggNDUuNTY4IDAgMCAwLTY0LjQzODg1OCA2NC40Mzg4NTh6IiBmaWxsPSIjNGU4M2ZkIiBwLWlkPSI2MzY4Ij48L3BhdGg+PC9zdmc+'
    }
  });

  const selectFile = useCallback(
    async (files: File[], key: 'scriptOpenIcon' | 'scriptCloseIcon') => {
      const file = files[0];
      if (!file) return;
      // image to base64
      const base64 = await fileToBase64(file);
      setValue(key, base64);
    },
    [setValue]
  );

  watch(() => {
    setRefresh(!refresh);
  });

  const baseUrl = feConfigs?.customSharePageDomain || location?.origin;
  const linkUrl = `${baseUrl}${subRoute ? `${subRoute}/` : '/'}chat/share?shareId=${share?.shareId}${
    getValues('showHistory') ? '' : '&showHistory=0'
  }`;

  const wayMap = {
    [UsingWayEnum.link]: {
      blockTitle: t('common:core.app.outLink.Link block title'),
      code: linkUrl
    },
    [UsingWayEnum.iframe]: {
      blockTitle: t('common:core.app.outLink.Iframe block title'),
      code: `<iframe
  src="${linkUrl}"
  style="width: 100%; height: 100%;"
  frameborder="0" 
  allow="*"
/>`
    },
    [UsingWayEnum.script]: {
      blockTitle: t('common:core.app.outLink.Script block title'),
      code: `<script
  type="text/javascript"
  src="${baseUrl}/js/iframe.js"
  id="chatbot-iframe" 
  data-bot-src="${linkUrl}" 
  data-default-open="${getValues('scriptDefaultOpen') ? 'true' : 'false'}"
  data-drag="${getValues('scriptIconCanDrag') ? 'true' : 'false'}"
  data-open-icon="${getValues('scriptOpenIcon')}"
  data-close-icon="${getValues('scriptCloseIcon')}"
  defer
></script>`
    }
  };

  const gridItemStyle: FlexProps = {
    alignItems: 'center',
    bg: 'myWhite.600',
    p: 2,
    borderRadius: 'md',
    border: theme.borders.sm
  };

  return (
    <MyModal
      isOpen
      isCentered
      iconSrc="/imgs/modal/usingWay.svg"
      title={t('common:core.app.outLink.Select Using Way')}
      onClose={onClose}
      maxW={['90vw', '700px']}
    >
      <ModalBody py={4}>
        <MyRadio
          gridGap={2}
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(3,1fr)']}
          value={getValues('usingWay')}
          list={VariableTypeList}
          hiddenCircle
          p={0}
          onChange={(e) => {
            setValue('usingWay', e);
          }}
        />

        {/* config */}
        <Grid
          gridTemplateColumns={['repeat(2,1fr)', 'repeat(3,1fr)']}
          gridGap={4}
          my={5}
          fontSize={'sm'}
        >
          <Flex {...gridItemStyle}>
            <Box flex={1}>{t('common:core.app.outLink.Show History')}</Box>
            <Switch {...register('showHistory')} />
          </Flex>
          {getValues('usingWay') === UsingWayEnum.script && (
            <>
              <Flex {...gridItemStyle}>
                <Box flex={1}>{t('common:core.app.outLink.Can Drag')}</Box>
                <Switch {...register('scriptIconCanDrag')} />
              </Flex>
              <Flex {...gridItemStyle}>
                <Box flex={1}>{t('common:core.app.outLink.Default open')}</Box>
                <Switch {...register('scriptDefaultOpen')} />
              </Flex>
              <Flex {...gridItemStyle}>
                <Box flex={1}>{t('common:core.app.outLink.Script Open Icon')}</Box>
                <MyImage
                  src={getValues('scriptOpenIcon')}
                  alt={''}
                  w={'20px'}
                  h={'20px'}
                  cursor={'pointer'}
                  onClick={() => onOpen('scriptOpenIcon')}
                />
              </Flex>
              <Flex {...gridItemStyle}>
                <Box flex={1}>{t('common:core.app.outLink.Script Close Icon')}</Box>
                <MyImage
                  src={getValues('scriptCloseIcon')}
                  alt={''}
                  w={'20px'}
                  h={'20px'}
                  cursor={'pointer'}
                  onClick={() => onOpen('scriptCloseIcon')}
                />
              </Flex>
            </>
          )}
        </Grid>

        {/* code */}
        <Box borderRadius={'md'} bg={'myGray.100'} overflow={'hidden'} fontSize={'sm'}>
          <Flex
            p={3}
            bg={'myWhite.500'}
            border={theme.borders.base}
            borderTopLeftRadius={'md'}
            borderTopRightRadius={'md'}
          >
            <Box flex={1}>{wayMap[getValues('usingWay')].blockTitle}</Box>
            <MyIcon
              name={'copy'}
              w={'16px'}
              color={'myGray.600'}
              cursor={'pointer'}
              _hover={{ color: 'primary.500' }}
              onClick={() => {
                copyData(wayMap[getValues('usingWay')].code);
              }}
            />
          </Flex>
          <Box whiteSpace={'pre'} p={3} overflowX={'auto'}>
            {wayMap[getValues('usingWay')].code}
          </Box>
        </Box>
      </ModalBody>

      <File onSelect={selectFile} />
    </MyModal>
  );
};

export default SelectUsingWayModal;
