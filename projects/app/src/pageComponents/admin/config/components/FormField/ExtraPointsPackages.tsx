import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import type { PointsPackageItem } from '@fastgpt/global/support/wallet/sub/type';
import React, { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';

const AddPackageModal = ({
  onClose,
  onSubmit,
  editingPackage
}: {
  onClose: () => void;
  onSubmit: (data: PointsPackageItem) => void;
  editingPackage?: PointsPackageItem;
}) => {
  const { handleSubmit, watch, setValue } = useForm<PointsPackageItem>({
    defaultValues: editingPackage || {
      points: 1000,
      month: 1,
      price: 15,
      activityBonusPoints: 0
    }
  });

  const handleFormSubmit = (data: PointsPackageItem) => {
    onSubmit(data);
    onClose();
  };

  return (
    <MyModal
      isOpen
      title="额外AI积分费用配置"
      isCentered
      minW={'600px'}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit(handleFormSubmit)}>确认</Button>
        </>
      }
    >
      <Flex mb={6} gap={8}>
        <Box flex={1}>
          <FormLabel mb={2}>积分</FormLabel>
          <MyNumberInput
            value={watch('points')}
            min={0}
            step={1000}
            onChange={(e) => {
              setValue('points', e || 0);
            }}
            placeholder="在此输入积分"
          />
        </Box>
        <Box flex={1}>
          <FormLabel mb={2}>有效期</FormLabel>
          <MySelect
            bg={'myGray.50'}
            h={10}
            value={watch('month')}
            onChange={(e) => {
              setValue('month', Number(e));
            }}
            list={Array.from({ length: 12 }, (_, i) => ({
              value: i + 1,
              label: i + 1 === 12 ? '1 年' : `${i + 1} 个月`
            }))}
          />
        </Box>
      </Flex>
      <Flex mb={6} gap={8}>
        <Box flex={1}>
          <FormLabel mb={2}>价格</FormLabel>
          <MyNumberInput
            value={watch('price')}
            min={0}
            onChange={(e) => {
              setValue('price', e || 0);
            }}
            placeholder="在此输入价格"
          />
        </Box>
      </Flex>
      <Flex mb={6} gap={8}>
        <Box flex={1}>
          <FormLabel mb={2}>活动赠送积分</FormLabel>
          <MyNumberInput
            value={watch('activityBonusPoints')}
            min={0}
            onChange={(e) => {
              setValue('activityBonusPoints', e || 0);
            }}
            placeholder="默认为 0"
          />
        </Box>
      </Flex>
    </MyModal>
  );
};

const ExtraPointsPackages = ({
  value,
  onChange
}: {
  value: PointsPackageItem[];
  onChange: (value: PointsPackageItem[]) => void;
}) => {
  const [isAddingPackage, setIsAddingPackage] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number>();

  const packages = useMemo<PointsPackageItem[]>(() => {
    return Array.isArray(value) ? value : [];
  }, [value]);

  const handleAddPackage = (newPackage: PointsPackageItem) => {
    if (editingIndex === undefined) {
      onChange([...packages, newPackage]);
    } else {
      const updatedPackages = [...packages];
      updatedPackages[editingIndex] = newPackage;
      onChange(updatedPackages);
      setEditingIndex(undefined);
    }
    setIsAddingPackage(false);
  };

  const handleDeletePackage = (index: number) => {
    const updatedPackages = packages.filter((_, i) => i !== index);
    onChange(updatedPackages);
  };

  const handleEditPackage = (index: number) => {
    setEditingIndex(index);
    setIsAddingPackage(true);
  };

  const getMonthText = (month: number) => {
    if (month === 12) return '1 年';
    return `${month} 个月`;
  };

  return (
    <>
      <Box>
        <Flex justifyContent="space-between" alignItems="center" mb={4}>
          <Box color={'myGray.900'}>额外 AI 积分费用</Box>
          <Box flex={1} />
          <Button
            variant={'primaryOutline'}
            size={'xs'}
            isDisabled={value.length >= 9}
            onClick={() => {
              setEditingIndex(undefined);
              setIsAddingPackage(true);
            }}
          >
            新增
          </Button>
        </Flex>

        <Box border={'1px solid'} borderColor={'myGray.200'} borderRadius={'md'}>
          <Table size="sm">
            <Thead h={10}>
              <Tr>
                <Th>积分</Th>
                <Th>有效期</Th>
                <Th>价格</Th>
                <Th>活动赠送积分</Th>
                <Th w={'100px'}>操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {packages.map((pkg, index) => {
                const isLast = index === packages.length - 1;
                return (
                  <Tr key={index}>
                    <Td borderBottom={isLast ? 'none' : '1px solid'} borderColor={'myGray.200'}>
                      {pkg.points.toLocaleString()}
                    </Td>
                    <Td borderBottom={isLast ? 'none' : '1px solid'} borderColor={'myGray.200'}>
                      {getMonthText(pkg.month)}
                    </Td>
                    <Td borderBottom={isLast ? 'none' : '1px solid'} borderColor={'myGray.200'}>
                      ¥ {pkg.price}
                    </Td>
                    <Td borderBottom={isLast ? 'none' : '1px solid'} borderColor={'myGray.200'}>
                      {pkg.activityBonusPoints?.toLocaleString() || '-'}
                    </Td>
                    <Td borderBottom={isLast ? 'none' : '1px solid'} borderColor={'myGray.200'}>
                      <HStack spacing={2}>
                        <IconButton
                          aria-label="编辑"
                          icon={<MyIcon name="common/settingLight" w={'14px'} />}
                          size="xs"
                          variant={'whitePrimary'}
                          onClick={() => handleEditPackage(index)}
                        />
                        <IconButton
                          aria-label="删除"
                          icon={<MyIcon name="delete" w={'14px'} />}
                          size="xs"
                          variant={'whiteDanger'}
                          onClick={() => handleDeletePackage(index)}
                        />
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Box>
      </Box>

      {isAddingPackage && (
        <AddPackageModal
          editingPackage={editingIndex === undefined ? undefined : packages[editingIndex]}
          onClose={() => {
            setIsAddingPackage(false);
            setEditingIndex(undefined);
          }}
          onSubmit={handleAddPackage}
        />
      )}
    </>
  );
};

export default React.memo(ExtraPointsPackages);
