import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  useDisclosure,
  Switch,
  Input,
  Center,
  Textarea,
  InputGroup,
  InputRightElement,
  Checkbox,
  useCheckboxGroup
} from '@chakra-ui/react';
import React, { ChangeEvent, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import type { AppQuestionGuideTextConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import MyInput from '@/components/MyInput';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useI18n } from '@/web/context/I18n';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { fileDownload } from '@/web/common/file/utils';

const csvTemplate = `"第一列内容"
"必填列"
"只会将第一列内容导入，其余列会被忽略"
"AIGC发展分为几个阶段？"
`;

const QGuidesConfig = ({
  value,
  onChange
}: {
  value: AppQuestionGuideTextConfigType;
  onChange: (e: AppQuestionGuideTextConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { appT, commonT } = useI18n();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isOpenTexts, onOpen: onOpenTexts, onClose: onCloseTexts } = useDisclosure();

  const { AppQGuide } = useAppStore();
  const isOpenInputTips = value.open;
  const { feConfigs } = useSystemStore();

  useEffect(() => {
    onChange({
      ...value,
      text: AppQGuide
    });
  }, [AppQGuide]);

  const formLabel = useMemo(() => {
    if (!isOpenInputTips) {
      return t('core.app.whisper.Close');
    }
    return t('core.app.whisper.Open');
  }, [t, isOpenInputTips]);

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/inputGuides'} mr={2} w={'20px'} />
      <Box fontWeight={'medium'}>{appT('modules.Question Guide')}</Box>
      <Box flex={1} />
      <MyTooltip label={appT('modules.Config question guide')}>
        <Button
          variant={'transparentBase'}
          iconSpacing={1}
          size={'sm'}
          mr={'-5px'}
          onClick={onOpen}
        >
          {formLabel}
        </Button>
      </MyTooltip>
      <MyModal
        title={appT('modules.Question Guide')}
        iconSrc="core/app/inputGuides"
        isOpen={isOpen}
        onClose={onClose}
      >
        <ModalBody px={[5, 16]} py={[4, 8]} w={'500px'}>
          <Flex justifyContent={'space-between'} alignItems={'center'}>
            {appT('modules.Question Guide Switch')}
            <Switch
              isChecked={isOpenInputTips}
              size={'lg'}
              onChange={(e) => {
                onChange({
                  ...value,
                  open: e.target.checked
                });
              }}
            />
          </Flex>
          {isOpenInputTips && (
            <>
              <Flex mt={8} alignItems={'center'}>
                {appT('modules.Question Guide Texts')}
                <Box fontSize={'xs'} px={2} bg={'myGray.100'} ml={1} rounded={'full'}>
                  {value.text?.length || 0}
                </Box>
                <Box flex={'1 0 0'} />
                <Button
                  variant={'whiteBase'}
                  size={'sm'}
                  leftIcon={<MyIcon boxSize={'4'} name={'common/settingLight'} />}
                  onClick={onOpenTexts}
                >
                  {appT('modules.Config Texts')}
                </Button>
              </Flex>
              <>
                <Flex mt={8} alignItems={'center'}>
                  {appT('modules.Custom question guide URL')}
                  <Flex
                    onClick={() => window.open(`${feConfigs.docUrl}/docs/course/custom_link`)}
                    color={'primary.700'}
                    alignItems={'center'}
                    cursor={'pointer'}
                  >
                    <MyIcon name={'book'} ml={4} mr={1} />
                    {commonT('common.Documents')}
                  </Flex>
                  <Box flex={'1 0 0'} />
                </Flex>
                <Textarea
                  mt={2}
                  bg={'myGray.50'}
                  defaultValue={value.customURL}
                  onBlur={(e) =>
                    onChange({
                      ...value,
                      customURL: e.target.value
                    })
                  }
                />
              </>
            </>
          )}
          <Flex w={'full'}>
            <Box flex={1} />
            <Button mt={4} onClick={() => onClose()}>
              {commonT('common.Confirm')}
            </Button>
          </Flex>
        </ModalBody>
      </MyModal>

      <TextConfigModal
        isOpenTexts={isOpenTexts}
        onCloseTexts={onCloseTexts}
        value={value}
        onChange={onChange}
      />
    </Flex>
  );
};

export default React.memo(QGuidesConfig);

const TextConfigModal = ({
  isOpenTexts,
  onCloseTexts,
  value,
  onChange
}: {
  isOpenTexts: boolean;
  onCloseTexts: () => void;
  value: AppQuestionGuideTextConfigType;
  onChange: (e: AppQuestionGuideTextConfigType) => void;
}) => {
  const { appT, commonT } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [checkboxValue, setCheckboxValue] = React.useState<string[]>([]);
  const [searchKey, setSearchKey] = React.useState<string>('');
  const [isEditIndex, setIsEditIndex] = React.useState(-1);
  const [isAdding, setIsAdding] = React.useState(false);
  const [showIcons, setShowIcons] = React.useState<number | null>(null);

  const { getCheckboxProps } = useCheckboxGroup();

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const content = e.target?.result as string;
        const rows = content.split('\n');
        const texts = rows.map((row) => row.split(',')[0]);
        const newText = texts.filter((row) => value.text.indexOf(row) === -1 && !!row);
        onChange({
          ...value,
          text: [...value.text, ...newText]
        });

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      };
      reader.readAsText(file);
    }
  };

  const filterTextList = useMemo(() => {
    return value.text?.filter((_) => _.includes(searchKey));
  }, [searchKey, value.text]);

  return (
    <MyModal
      title={appT('modules.Config Texts')}
      iconSrc="core/app/inputGuides"
      isOpen={isOpenTexts}
      onClose={() => {
        setCheckboxValue([]);
        setSearchKey('');
        onCloseTexts();
      }}
    >
      <ModalBody w={'500px'}>
        <Flex gap={4} alignItems={'center'} borderBottom={'1px solid #E8EBF0'} pb={4}>
          <Box flex={1}>
            <MyInput
              leftIcon={<MyIcon name={'common/searchLight'} boxSize={4} />}
              bg={'myGray.50'}
              w={'full'}
              h={9}
              placeholder={commonT('common.Search')}
              onChange={(e) => setSearchKey(e.target.value)}
            />
          </Box>
          <input
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileSelected}
          />
          <Button
            onClick={() => {
              fileInputRef.current?.click();
            }}
            variant={'whiteBase'}
            size={'sm'}
            leftIcon={<MyIcon name={'common/importLight'} boxSize={4} />}
          >
            {commonT('common.Import')}
          </Button>
          <Box
            cursor={'pointer'}
            onClick={() => {
              fileDownload({
                text: csvTemplate,
                type: 'text/csv;charset=utf-8',
                filename: 'questionGuide_template.csv'
              });
            }}
          >
            <QuestionTip ml={-2} label={appT('modules.Only support CSV')} />
          </Box>
        </Flex>
        <Box mt={4} minH={'300px'} maxH={'400px'}>
          <Flex justifyContent={'space-between'}>
            <Flex alignItems={'center'}>
              <Checkbox
                value={'all'}
                size={'lg'}
                mr={2}
                defaultChecked={value.text && checkboxValue.length === value.text.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setCheckboxValue(filterTextList);
                  } else {
                    setCheckboxValue([]);
                  }
                }}
              />
              {commonT('common.Select all')}
            </Flex>

            <Flex gap={4}>
              <Button
                variant={'whiteBase'}
                display={checkboxValue.length === 0 ? 'none' : 'flex'}
                size={'sm'}
                leftIcon={<MyIcon name={'delete'} boxSize={4} />}
                onClick={() => {
                  setCheckboxValue([]);
                  onChange({
                    ...value,
                    text: value.text.filter((_) => !checkboxValue.includes(_))
                  });
                }}
              >
                {commonT('common.Delete')}
              </Button>
              <Button
                display={checkboxValue.length !== 0 ? 'none' : 'flex'}
                onClick={() => {
                  setIsEditIndex(value.text.length);
                  onChange({
                    ...value,
                    text: [...value.text, '']
                  });
                  setIsAdding(true);
                }}
                size={'sm'}
                leftIcon={<MyIcon name={'common/addLight'} boxSize={4} />}
              >
                {commonT('common.Add')}
              </Button>
            </Flex>
          </Flex>
          {!value.text || value.text?.length === 0 ? (
            <Center flexDirection={'column'} mt={12}>
              <MyIcon name={'empty'} color={'transparent'} w={'54px'} />
              <Box mt={3} color={'myGray.600'}>
                {commonT('No data')}
              </Box>
            </Center>
          ) : (
            <Box height={'full'} pb={4} overflowY={'auto'}>
              {filterTextList.map((item, index) => (
                <Flex
                  key={index}
                  alignItems={'center'}
                  h={10}
                  mt={2}
                  onMouseEnter={() => setShowIcons(index)}
                  onMouseLeave={() => setShowIcons(null)}
                >
                  <Checkbox
                    {...getCheckboxProps({ value: item })}
                    size={'lg'}
                    mr={2}
                    isChecked={checkboxValue.includes(item)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCheckboxValue([...checkboxValue, item]);
                      } else {
                        setCheckboxValue(checkboxValue.filter((_) => _ !== item));
                      }
                    }}
                  />
                  {index === isEditIndex ? (
                    <InputGroup alignItems={'center'} h={'full'}>
                      <Input
                        autoFocus
                        h={'full'}
                        defaultValue={item}
                        onBlur={(e) => {
                          setIsEditIndex(-1);
                          if (
                            !e.target.value ||
                            (value.text.indexOf(e.target.value) !== -1 &&
                              value.text.indexOf(e.target.value) !== index)
                          ) {
                            isAdding &&
                              onChange({
                                ...value,
                                text: value.text?.filter((_, i) => i !== index)
                              });
                          } else {
                            onChange({
                              ...value,
                              text: value.text?.map((v, i) => (i !== index ? v : e.target.value))
                            });
                          }
                          setIsAdding(false);
                        }}
                      />
                      <InputRightElement alignItems={'center'} pr={4} display={'flex'}>
                        <MyIcon name={'save'} boxSize={4} cursor={'pointer'} />
                      </InputRightElement>
                    </InputGroup>
                  ) : (
                    <Flex
                      h={'full'}
                      w={'full'}
                      rounded={'md'}
                      px={4}
                      bg={'myGray.50'}
                      alignItems={'center'}
                      border={'1px solid #F0F1F6'}
                      _hover={{ border: '1px solid #94B5FF' }}
                    >
                      {item}
                      <Box flex={1} />
                      {checkboxValue.length === 0 && (
                        <Box display={showIcons === index ? 'flex' : 'none'}>
                          <MyIcon
                            name={'edit'}
                            boxSize={4}
                            mr={2}
                            color={'myGray.600'}
                            cursor={'pointer'}
                            onClick={() => setIsEditIndex(index)}
                          />
                          <MyIcon
                            name={'delete'}
                            boxSize={4}
                            color={'myGray.600'}
                            cursor={'pointer'}
                            onClick={() => {
                              const temp = value.text?.filter((_, i) => i !== index);
                              onChange({
                                ...value,
                                text: temp
                              });
                            }}
                          />
                        </Box>
                      )}
                    </Flex>
                  )}
                </Flex>
              ))}
            </Box>
          )}
        </Box>
      </ModalBody>
    </MyModal>
  );
};
