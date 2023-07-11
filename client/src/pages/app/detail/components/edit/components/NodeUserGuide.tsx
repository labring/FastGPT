import React, { useCallback, useMemo, useState } from 'react';
import { NodeProps } from 'reactflow';
import {
  Box,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  Switch,
  Input,
  useDisclosure,
  useTheme,
  Grid,
  FormControl,
  Textarea
} from '@chakra-ui/react';
import { QuestionOutlineIcon, SmallAddIcon } from '@chakra-ui/icons';
import NodeCard from './modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Container from './modules/Container';
import { SystemInputEnum, VariableInputEnum } from '@/constants/app';
import type { VariableItemType } from '@/types/app';
import MyIcon from '@/components/Icon';
import { useForm } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import { Label } from './render/RenderInput';
import MyTooltip from '@/components/MyTooltip';

const VariableTypeList = [
  { label: '文本', icon: 'settingLight', key: VariableInputEnum.input },
  { label: '下拉单选', icon: 'settingLight', key: VariableInputEnum.select }
];
const defaultVariable: VariableItemType = {
  id: nanoid(),
  key: 'key',
  label: 'label',
  type: VariableInputEnum.input,
  required: true,
  maxLen: 50,
  enums: [{ value: '' }]
};

const NodeUserGuide = ({
  data: { inputs, outputs, onChangeNode, ...props }
}: NodeProps<FlowModuleItemType>) => {
  const theme = useTheme();

  const variables = useMemo(
    () =>
      (inputs.find((item) => item.key === SystemInputEnum.variables)
        ?.value as VariableItemType[]) || [],
    [inputs]
  );
  const welcomeText = useMemo(
    () => inputs.find((item) => item.key === SystemInputEnum.welcomeText)?.value,
    [inputs]
  );

  const [refresh, setRefresh] = useState(false);
  const { isOpen, onClose, onOpen } = useDisclosure();

  const { reset, getValues, setValue, register, control, handleSubmit } = useForm<{
    variable: VariableItemType;
  }>({
    defaultValues: {
      variable: defaultVariable
    }
  });

  const {
    fields: selectEnums,
    append: appendEnums,
    remove: removeEnums
  } = useFieldArray({
    control,
    name: 'variable.enums'
  });

  const updateVariables = useCallback(
    (value: VariableItemType[]) => {
      onChangeNode({
        moduleId: props.moduleId,
        key: SystemInputEnum.variables,
        type: 'inputs',
        value
      });
    },
    [onChangeNode, props.moduleId]
  );

  const onclickSubmit = useCallback(
    ({ variable }: { variable: VariableItemType }) => {
      updateVariables(variables.map((item) => (item.id === variable.id ? variable : item)));
      onClose();
    },
    [onClose, updateVariables, variables]
  );

  return (
    <>
      <NodeCard minW={'300px'} {...props}>
        <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
          <>
            <Flex mb={1} alignItems={'center'}>
              <MyIcon name={'welcomeText'} mr={2} w={'16px'} color={'#E74694'} />
              <Box>对话开场白</Box>
            </Flex>
            <Textarea
              className="nodrag"
              rows={3}
              resize={'both'}
              defaultValue={welcomeText}
              bg={'myWhite.600'}
              onChange={(e) => {
                onChangeNode({
                  moduleId: props.moduleId,
                  key: SystemInputEnum.welcomeText,
                  type: 'inputs',
                  value: e.target.value
                });
              }}
            />
          </>
          <Box mt={4}>
            <Flex alignItems={'center'}>
              <MyIcon name={'variable'} mr={2} w={'20px'} color={'#FF8A4C'} />
              <Box>变量</Box>
              <MyTooltip
                label={`变量会在开始对话前输入，仅会在本次对话中生效。\n你可以在任何字符串模块（系统提示词、限定词等）中使用 {{变量key}} 来代表变量输入。`}
              >
                <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
              </MyTooltip>
            </Flex>
            <TableContainer>
              <Table>
                <Thead>
                  <Tr>
                    <Th>变量名</Th>
                    <Th>变量 key</Th>
                    <Th>必填</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {variables.map((item, index) => (
                    <Tr key={index}>
                      <Td>{item.label} </Td>
                      <Td>{item.key}</Td>
                      <Td>{item.required ? '✔' : ''}</Td>
                      <Td>
                        <MyIcon
                          mr={3}
                          name={'settingLight'}
                          w={'16px'}
                          cursor={'pointer'}
                          onClick={() => {
                            onOpen();
                            reset({ variable: item });
                          }}
                        />
                        <MyIcon
                          name={'delete'}
                          w={'16px'}
                          cursor={'pointer'}
                          onClick={() =>
                            updateVariables(variables.filter((variable) => variable.id !== item.id))
                          }
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
            <Box mt={2} textAlign={'right'}>
              <Button
                variant={'base'}
                onClick={() => {
                  const newVariable = { ...defaultVariable, id: nanoid() };
                  updateVariables(variables.concat(newVariable));
                  reset({ variable: newVariable });
                  onOpen();
                }}
              >
                + 新增
              </Button>
            </Box>
          </Box>
        </Container>
      </NodeCard>
      <Modal isOpen={isOpen} onClose={() => {}}>
        <ModalOverlay />
        <ModalContent maxW={'Min(400px,90vw)'}>
          <ModalHeader display={'flex'}>
            <MyIcon name={'variable'} mr={2} w={'24px'} color={'#FF8A4C'} />
            变量设置
          </ModalHeader>
          <ModalBody>
            <Flex alignItems={'center'}>
              <Box w={'70px'}>必填</Box>
              <Switch {...register('variable.required')} />
            </Flex>
            <Flex mt={5} alignItems={'center'}>
              <Box w={'80px'}>变量名</Box>
              <Input {...register('variable.label', { required: '变量名不能为空' })} />
            </Flex>
            <Flex mt={5} alignItems={'center'}>
              <Box w={'80px'}>变量 key</Box>
              <Input {...register('variable.key', { required: '变量 key 不能为空' })} />
            </Flex>

            <Box mt={5} mb={2}>
              字段类型
            </Box>
            <Grid gridTemplateColumns={'repeat(2,130px)'} gridGap={4}>
              {VariableTypeList.map((item) => (
                <Flex
                  key={item.key}
                  px={4}
                  py={1}
                  border={theme.borders.base}
                  borderRadius={'md'}
                  cursor={'pointer'}
                  {...(item.key === getValues('variable.type')
                    ? {
                        bg: 'myWhite.600'
                      }
                    : {
                        _hover: {
                          boxShadow: 'md'
                        },
                        onClick: () => {
                          setValue('variable.type', item.key);
                          setRefresh(!refresh);
                        }
                      })}
                >
                  <MyIcon name={item.icon as any} w={'16px'} />
                  <Box ml={3}>{item.label}</Box>
                </Flex>
              ))}
            </Grid>

            {getValues('variable.type') === VariableInputEnum.input && (
              <>
                <Box mt={5} mb={2}>
                  最大长度
                </Box>
                <Box>
                  <NumberInput max={100} min={1} step={1} position={'relative'}>
                    <NumberInputField
                      {...register('variable.maxLen', {
                        min: 1,
                        max: 100,
                        valueAsNumber: true
                      })}
                      max={100}
                    />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </Box>
              </>
            )}

            {getValues('variable.type') === VariableInputEnum.select && (
              <>
                <Box mt={5} mb={2}>
                  选项
                </Box>
                <Box>
                  {selectEnums.map((item, i) => (
                    <Flex key={item.id} mb={2} alignItems={'center'}>
                      <FormControl>
                        <Input
                          {...register(`variable.enums.${i}.value`, {
                            required: '选项内容不能为空'
                          })}
                        />
                      </FormControl>
                      <MyIcon
                        ml={3}
                        name={'delete'}
                        w={'16px'}
                        cursor={'pointer'}
                        p={2}
                        borderRadius={'lg'}
                        _hover={{ bg: 'red.100' }}
                        onClick={() => removeEnums(i)}
                      />
                    </Flex>
                  ))}
                </Box>
                <Button
                  variant={'solid'}
                  w={'100%'}
                  textAlign={'left'}
                  leftIcon={<SmallAddIcon />}
                  bg={'myGray.100 !important'}
                  onClick={() => appendEnums({ value: '' })}
                >
                  添加选项
                </Button>
              </>
            )}
          </ModalBody>

          <ModalFooter>
            <Button variant={'base'} mr={3} onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleSubmit(onclickSubmit)}>确认</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};
export default React.memo(NodeUserGuide);
