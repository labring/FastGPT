import React, { useState, useEffect, useMemo } from 'react';
import { VStack, Flex, FormLabel, Input, Button, Text, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { CustomSelect } from './Select';
type MapKeyValuePair = { key: string; value: string };

// mapKeys determines the available selection options
export const ConstructMappingComponent = function ({
  mapKeys,
  mapData,
  setMapData
}: {
  mapKeys: string[];
  mapData: Record<string, string>;
  setMapData: (mapping: Record<string, string>) => void;
}) {
  const { t } = useTranslation();

  const [mapKeyValuePairs, setMapkeyValuePairs] = useState<Array<MapKeyValuePair>>([]);

  const [isInternalUpdate, setIsInternalUpdate] = useState(false);

  useEffect(() => {
    if (!isInternalUpdate) {
      const entries = Object.entries(mapData);
      setMapkeyValuePairs(
        entries.length > 0
          ? entries.map(([key, value]) => ({ key, value }))
          : [{ key: '', value: '' }]
      );
    }
    setIsInternalUpdate(false);
  }, [mapData]);

  const handleDropdownItemDisplay = (dropdownItem: string) => {
    if (dropdownItem === t('common:channelFormPlaceholder.modelMappingInput')) {
      return (
        <Text
          fontSize="12px"
          fontStyle="normal"
          fontWeight={400}
          lineHeight="16px"
          letterSpacing="0.048px"
        >
          {t('common:channelFormPlaceholder.modelMappingInput')}
        </Text>
      );
    }
    return (
      <Text
        fontSize="12px"
        fontStyle="normal"
        fontWeight={400}
        lineHeight="16px"
        letterSpacing="0.048px"
      >
        {dropdownItem}
      </Text>
    );
  };

  const handleSeletedItemDisplay = (selectedItem: string) => {
    if (selectedItem === t('common:channelFormPlaceholder.modelMappingInput')) {
      return (
        <Text
          fontSize="12px"
          fontStyle="normal"
          fontWeight={400}
          lineHeight="16px"
          letterSpacing="0.048px"
        >
          {t('common:channelFormPlaceholder.modelMappingInput')}
        </Text>
      );
    }
    return (
      <Box
        maxWidth="114px"
        overflowX="auto" // overflowX needed for long text
        whiteSpace="nowrap" // prevent text from wrapping
        css={{
          '&::-webkit-scrollbar': { display: 'none' },
          msOverflowStyle: 'none',
          scrollbarWidth: 'none'
        }}
      >
        <Text
          fontSize="12px"
          fontStyle="normal"
          fontWeight={400}
          lineHeight="16px"
          letterSpacing="0.048px"
        >
          {selectedItem}
        </Text>
      </Box>
    );
  };

  // Handling mapData and mapKeyValuePairs cleanup when map keys change.
  useEffect(() => {
    // 1. Handle mapData cleanup
    const removedKeysFromMapData = Object.keys(mapData).filter((key) => !mapKeys.includes(key));
    if (removedKeysFromMapData.length > 0) {
      const newMapData = { ...mapData };
      removedKeysFromMapData.forEach((key) => {
        delete newMapData[key];
      });
      setIsInternalUpdate(true);
      setMapData(newMapData);
    }

    // 2. Handle mapKeyValuePairs cleanup
    const removedPairs = mapKeyValuePairs.filter((pair) => pair.key && !mapKeys.includes(pair.key));
    if (removedPairs.length > 0) {
      const newMapKeyValuePairs = mapKeyValuePairs.filter(
        (pair) => !pair.key || mapKeys.includes(pair.key)
      );
      setMapkeyValuePairs(newMapKeyValuePairs);
    }
  }, [mapKeys]);

  // Get the keys that have been selected
  const getSelectedMapKeys = (currentIndex: number) => {
    const selected = new Set<string>();
    mapKeyValuePairs.forEach((mapKeyValuePair, idx) => {
      if (idx !== currentIndex && mapKeyValuePair.key) {
        selected.add(mapKeyValuePair.key);
      }
    });
    return selected;
  };

  // Handling adding a new row
  const handleAddNewMapKeyPair = () => {
    setMapkeyValuePairs([...mapKeyValuePairs, { key: '', value: '' }]);
  };

  // Handling deleting a row
  const handleRemoveMapKeyPair = (index: number) => {
    const mapKeyValuePair = mapKeyValuePairs[index];
    const newMapData = { ...mapData };
    if (mapKeyValuePair.key) {
      delete newMapData[mapKeyValuePair.key];
    }
    setIsInternalUpdate(true);
    setMapData(newMapData);

    const newMapKeyValuePairs = mapKeyValuePairs.filter((_, idx) => idx !== index);
    setMapkeyValuePairs(newMapKeyValuePairs);
  };

  // Handling selection/input changes
  const handleInputChange = (index: number, field: 'key' | 'value', value: string) => {
    const newMapKeyValuePairs = [...mapKeyValuePairs];
    const oldValue = newMapKeyValuePairs[index][field];
    newMapKeyValuePairs[index][field] = value;

    // Update the mapping relationship
    const newMapData = { ...mapData };
    if (field === 'key') {
      if (oldValue) delete newMapData[oldValue];

      if (!value) {
        newMapKeyValuePairs[index].value = '';
      }

      if (value && newMapKeyValuePairs[index].value) {
        newMapData[value] = newMapKeyValuePairs[index].value;
      }
    } else {
      if (newMapKeyValuePairs[index].key) {
        newMapData[newMapKeyValuePairs[index].key] = value;
      }
    }

    setMapkeyValuePairs(newMapKeyValuePairs);
    setIsInternalUpdate(true);
    setMapData(newMapData);
  };

  // Check if there are still keys that can be selected
  const hasAvailableKeys = useMemo(() => {
    const usedKeys = new Set(
      mapKeyValuePairs.map((mapKeyValuePair) => mapKeyValuePair.key).filter(Boolean)
    );
    // Ensure mapKeyValuePairs length does not exceed mapKeys length
    return (
      mapKeyValuePairs.length < mapKeys.length && mapKeys.some((mapKey) => !usedKeys.has(mapKey))
    );
  }, [mapKeys, mapKeyValuePairs]);

  return (
    <VStack w="full" align="stretch" alignItems="flex-start" spacing="8px">
      <FormLabel
        fontSize="14px"
        fontStyle="normal"
        fontWeight={500}
        lineHeight="20px"
        letterSpacing="0.1px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        h="20px"
        m={0}
      >
        {t('common:channelForm.model_mapping')}
      </FormLabel>

      {mapKeyValuePairs.map((row, index) => (
        <Flex key={`${index}-${row.key}`} gap="8px" w="full" alignItems="center">
          <CustomSelect<string>
            listItems={mapKeys.filter((key) => !getSelectedMapKeys(index).has(key))}
            initSelectedItem={row.key !== '' && row.key ? row.key : undefined}
            // when select placeholder, the newSelectedItem is null
            handleSelectedItemChange={(newSelectedItem) =>
              handleInputChange(index, 'key', newSelectedItem)
            }
            handleDropdownItemDisplay={handleDropdownItemDisplay}
            handleSelectedItemDisplay={handleSeletedItemDisplay}
            placeholder={t('common:channelFormPlaceholder.modelMappingInput')}
          />

          <Box flex={1} w="full">
            <Input
              h="32px"
              value={row.value}
              onChange={(e) => handleInputChange(index, 'value', e.target.value)}
              placeholder={t('common:channelFormPlaceholder.modelMappingOutput')}
              py="8px"
              px="12px"
              borderRadius="6px"
              border="1px solid"
              borderColor="myGray.200"
              bgColor="white"
            />
          </Box>

          <Button
            h="32px"
            w="32px"
            variant="ghost"
            onClick={() => handleRemoveMapKeyPair(index)}
            display="flex"
            p="7px"
            alignItems="center"
            gap="6px"
            borderRadius="6px"
            _hover={{
              bg: 'myGray.50',
              color: 'red.600'
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="19"
              height="18"
              viewBox="0 0 19 18"
              fill="none"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M9.34847 1.32764H10.5129C10.8763 1.32762 11.1931 1.32761 11.4548 1.34899C11.7321 1.37164 12.0127 1.42198 12.2841 1.56028C12.6858 1.76491 13.0123 2.09144 13.2169 2.49306C13.3552 2.76449 13.4056 3.04513 13.4282 3.32237C13.4462 3.54294 13.4491 3.80273 13.4495 4.09652H16.1607C16.5749 4.09652 16.9107 4.43231 16.9107 4.84652C16.9107 5.26074 16.5749 5.59652 16.1607 5.59652H15.5262V12.63C15.5262 13.1855 15.5262 13.6474 15.4954 14.0244C15.4634 14.4171 15.3942 14.7832 15.2181 15.1287C14.9471 15.6606 14.5147 16.093 13.9828 16.364C13.6374 16.54 13.2713 16.6092 12.8786 16.6413C12.5016 16.6721 12.0397 16.6721 11.4842 16.6721H8.37716C7.82169 16.6721 7.35977 16.6721 6.98277 16.6413C6.5901 16.6092 6.22398 16.54 5.87851 16.364C5.34664 16.093 4.91422 15.6606 4.64321 15.1287C4.46719 14.7832 4.39799 14.4171 4.36591 14.0244C4.33511 13.6474 4.33512 13.1855 4.33513 12.63L4.33513 5.59652H3.70068C3.28647 5.59652 2.95068 5.26074 2.95068 4.84652C2.95068 4.43231 3.28647 4.09652 3.70068 4.09652H6.41187C6.4123 3.80273 6.41512 3.54294 6.43314 3.32237C6.4558 3.04513 6.50613 2.76449 6.64443 2.49306C6.84907 2.09144 7.1756 1.76491 7.57722 1.56028C7.84864 1.42198 8.12929 1.37164 8.40653 1.34899C8.66821 1.32761 8.98509 1.32762 9.34847 1.32764ZM5.83513 5.59652V12.5994C5.83513 13.1933 5.83571 13.5936 5.86093 13.9023C5.88543 14.2022 5.9294 14.3489 5.97972 14.4477C6.10692 14.6973 6.30987 14.9003 6.5595 15.0275C6.65826 15.0778 6.80501 15.1218 7.10492 15.1463C7.41358 15.1715 7.81389 15.1721 8.40779 15.1721H11.4536C12.0475 15.1721 12.4478 15.1715 12.7564 15.1463C13.0563 15.1218 13.2031 15.0778 13.3019 15.0275C13.5515 14.9003 13.7544 14.6973 13.8816 14.4477C13.932 14.3489 13.9759 14.2022 14.0004 13.9023C14.0256 13.5936 14.0262 13.1933 14.0262 12.5994V5.59652H5.83513ZM11.9494 4.09652H7.91192C7.91246 3.80578 7.91512 3.60411 7.92816 3.44452C7.94324 3.26004 7.96834 3.19877 7.98094 3.17405C8.04177 3.05467 8.13883 2.95761 8.2582 2.89679C8.28293 2.88419 8.3442 2.85908 8.52868 2.84401C8.72191 2.82822 8.97684 2.82764 9.3769 2.82764H10.4845C10.8845 2.82764 11.1394 2.82822 11.3327 2.84401C11.5172 2.85908 11.5784 2.88419 11.6032 2.89679C11.7225 2.95761 11.8196 3.05467 11.8804 3.17405C11.893 3.19877 11.9181 3.26004 11.9332 3.44452C11.9462 3.60411 11.9489 3.80578 11.9494 4.09652ZM8.54624 7.90374C8.96045 7.90374 9.29624 8.23953 9.29624 8.65374V12.1149C9.29624 12.5291 8.96045 12.8649 8.54624 12.8649C8.13202 12.8649 7.79624 12.5291 7.79624 12.1149V8.65374C7.79624 8.23953 8.13202 7.90374 8.54624 7.90374ZM11.3151 7.90374C11.7293 7.90374 12.0651 8.23953 12.0651 8.65374V12.1149C12.0651 12.5291 11.7293 12.8649 11.3151 12.8649C10.9009 12.8649 10.5651 12.5291 10.5651 12.1149V8.65374C10.5651 8.23953 10.9009 7.90374 11.3151 7.90374Z"
                fill="currentcolor"
              />
            </svg>
          </Button>
        </Flex>
      ))}

      {hasAvailableKeys && (
        <Button
          h="32px"
          _hover={{ borderColor: 'primary.300' }}
          variant="unstyled"
          onClick={handleAddNewMapKeyPair}
          w="full"
          display="flex"
          p="8px 14px"
          justifyContent="center"
          alignItems="center"
          gap="6px"
          alignSelf="stretch"
          borderRadius="6px"
          border="1px solid"
          borderColor="myGray.200"
          bg="white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="17"
            height="16"
            viewBox="0 0 17 16"
            fill="none"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M8.93068 2.6665C9.29887 2.6665 9.59735 2.96498 9.59735 3.33317V7.33317H13.5974C13.9655 7.33317 14.264 7.63165 14.264 7.99984C14.264 8.36803 13.9655 8.6665 13.5974 8.6665H9.59735V12.6665C9.59735 13.0347 9.29887 13.3332 8.93068 13.3332C8.56249 13.3332 8.26402 13.0347 8.26402 12.6665V8.6665H4.26402C3.89583 8.6665 3.59735 8.36803 3.59735 7.99984C3.59735 7.63165 3.89583 7.33317 4.26402 7.33317H8.26402V3.33317C8.26402 2.96498 8.56249 2.6665 8.93068 2.6665Z"
              fill="#485264"
            />
          </svg>
          <Text
            color="myGray.600"
            fontSize="12px"
            fontStyle="normal"
            fontWeight={500}
            lineHeight="16px"
            letterSpacing="0.5px"
          >
            {t('common:channelForm.add')}
          </Text>
        </Button>
      )}
    </VStack>
  );
};
export default ConstructMappingComponent;
