import { Box, Button, Flex, Input, Switch, Textarea } from '@chakra-ui/react';
import type { ExternalProviderWorkflowVarType } from '@fastgpt/global/common/system/types';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useState } from 'react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

const ThirdPartyVariables = ({
  value: variableList = [],
  onChange,
  title
}: {
  value?: ExternalProviderWorkflowVarType[];
  onChange: (value: ExternalProviderWorkflowVarType[]) => void;
  title: string;
}) => {
  const { toast } = useToast();

  const [currentThirdPartyVariable, setCurrentThirdPartyVariable] =
    useState<ExternalProviderWorkflowVarType>();

  const onSubmit = (data: ExternalProviderWorkflowVarType) => {
    if (variableList.find((item) => item.key === currentThirdPartyVariable?.key)) {
      const newVariableList = variableList.map((item) =>
        item.key === currentThirdPartyVariable?.key ? data : item
      );
      onChange(newVariableList);
    } else {
      onChange([...variableList, data]);
    }

    setCurrentThirdPartyVariable(undefined);
  };

  return (
    <Box minH={'400px'}>
      <Flex alignItems={'center'} justifyContent={'space-between'}>
        <MyTag fontSize={'md'} type="borderFill">
          {title}
        </MyTag>
        <Button
          size={'sm'}
          leftIcon={<MyIcon name={'common/addLight'} width={4} />}
          onClick={() =>
            setCurrentThirdPartyVariable({
              name: '',
              key: `System_${getNanoid(6)}`,
              intro: '',
              isOpen: false
            })
          }
        >
          新增
        </Button>
      </Flex>

      <Flex
        bg={'myGray.100'}
        h={8}
        mt={4}
        pl={8}
        rounded={'md'}
        alignItems={'center'}
        fontSize={'mini'}
        fontWeight={'medium'}
      >
        <Box w={2 / 10}>名称</Box>
        <Box w={3 / 10} pl={4}>
          key
        </Box>
        <Box w={3 / 10}>说明</Box>
        <Box w={1 / 10}>启用</Box>
        <Box w={1 / 10}>操作</Box>
      </Flex>

      <Flex mt={2} gap={1} flexDirection={'column'}>
        {variableList.map((item) => (
          <Flex key={item.name} alignItems={'center'} fontSize={'sm'}>
            <Box w={2 / 10} display={'flex'} alignItems={'center'} pl={4}>
              <MyIcon name={'common/variable'} width={'18px'} mr={1.5} />
              {item.name}
            </Box>
            <Box
              w={3 / 10}
              cursor={'pointer'}
              pl={4}
              onClick={() => {
                navigator.clipboard.writeText(`{{${item.key}}}`);
                toast({
                  status: 'success',
                  title: '复制成功'
                });
              }}
            >
              {`{{${item.key}}}`}
            </Box>
            <Box
              w={3 / 10}
              pl={3}
              whiteSpace={'nowrap'}
              overflow={'hidden'}
              textOverflow={'ellipsis'}
            >
              {item.intro}
            </Box>
            <Box w={1 / 10} pl={1}>
              <Switch
                isChecked={item.isOpen}
                size={'sm'}
                onChange={() => {
                  const newVariableList = variableList.map((currentItem) =>
                    currentItem.key === item.key
                      ? { ...currentItem, isOpen: !currentItem.isOpen }
                      : currentItem
                  );
                  onChange(newVariableList);
                }}
              />
            </Box>
            <Box w={1 / 10} display={'flex'} gap={2}>
              <Flex
                color={'myGray.500'}
                _hover={{ bg: 'myGray.05', color: 'primary.600' }}
                rounded={'xs'}
                p={1}
                cursor={'pointer'}
                onClick={() => {
                  setCurrentThirdPartyVariable(item);
                }}
              >
                <MyIcon name={'edit'} w={'16px'} />
              </Flex>
              <PopoverConfirm
                showCancel
                content={'确认删除该变量?'}
                confirmText={'删除'}
                cancelText={'取消'}
                type="delete"
                Trigger={
                  <Flex
                    color={'myGray.500'}
                    _hover={{ bg: 'myGray.05', color: 'red.500' }}
                    rounded={'xs'}
                    p={1}
                    cursor={'pointer'}
                  >
                    <MyIcon name={'delete'} w={'16px'} />
                  </Flex>
                }
                onConfirm={() => {
                  const newVariableList = variableList.filter(
                    (currentItem) => currentItem.key !== item.key
                  );
                  onChange(newVariableList);
                }}
              />
            </Box>
          </Flex>
        ))}
      </Flex>
      {currentThirdPartyVariable && (
        <ThirdPartyVariableItemModal
          currentThirdPartyVariable={currentThirdPartyVariable}
          onClose={() => setCurrentThirdPartyVariable(undefined)}
          onSubmit={onSubmit}
        />
      )}
    </Box>
  );
};

export default ThirdPartyVariables;

const ThirdPartyVariableItemModal = ({
  currentThirdPartyVariable,
  onClose,
  onSubmit
}: {
  currentThirdPartyVariable: ExternalProviderWorkflowVarType;
  onClose: () => void;
  onSubmit: (data: ExternalProviderWorkflowVarType) => void;
}) => {
  const { register, setValue, handleSubmit } = useForm({
    defaultValues: currentThirdPartyVariable
  });

  return (
    <MyModal
      title={'自定义工作流变量'}
      footer={
        <>
          <Button onClick={onClose} variant={'whiteBase'}>
            取消
          </Button>
          <Button onClick={handleSubmit(onSubmit)}>确定</Button>
        </>
      }
    >
      <>
        <Box color={'myGray.900'} mb={2} fontWeight={'medium'} fontSize={'14px'}>
          变量名
        </Box>
        <Input {...register('name', { required: true })} bg={'myGray.50'} placeholder={'变量名'} />
      </>

      <>
        <Box color={'myGray.900'} mt={6} mb={2} fontWeight={'medium'} fontSize={'14px'}>
          说明
        </Box>
        <Textarea {...register('intro')} bg={'myGray.50'} placeholder={'说明'} />
      </>

      <Flex mt={6}>
        <Box display={'flex'} color={'myGray.900'} flex={1} fontWeight={'medium'} fontSize={'14px'}>
          启用
        </Box>
        <Switch
          {...register('isOpen')}
          size={'sm'}
          onChange={(e) => setValue('isOpen', e.target.checked)}
        />
      </Flex>

      <>
        <Box color={'myGray.900'} mt={6} mb={2} fontWeight={'medium'} fontSize={'14px'}>
          使用量查询地址
        </Box>
        <Input {...register('url')} bg={'myGray.50'} placeholder={'使用量查询地址'} />
      </>
    </MyModal>
  );
};
