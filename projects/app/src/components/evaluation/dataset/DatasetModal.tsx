import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Select,
  Textarea,
  VStack,
  HStack,
  IconButton,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Checkbox,
  Text,
  Progress,
  Flex,
  Alert,
  AlertIcon,
  AlertDescription,
  Divider,
  Tab,
  Tabs,
  TabList,
  TabPanel,
  TabPanels
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useEvaluationStore } from '@/web/core/evaluation/store/evaluation';
import { createDataset, updateDataset, importDataset } from '@/web/core/evaluation/dataset';
import type {
  CreateDatasetParams,
  DatasetColumn,
  ImportResult
} from '@fastgpt/global/core/evaluation/type';

const DatasetModal: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const {
    showDatasetModal,
    editingItem,
    closeDatasetModal,
    addDataset,
    updateDataset: updateDatasetInStore
  } = useEvaluationStore();

  const isEdit = !!editingItem;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid }
  } = useForm<CreateDatasetParams>({
    defaultValues: {
      name: '',
      description: '',
      dataFormat: 'csv',
      columns: [
        { name: 'userInput', type: 'string', required: true, description: 'User input text' },
        { name: 'expectedOutput', type: 'string', required: true, description: 'Expected output' },
        {
          name: 'context',
          type: 'string',
          required: false,
          description: 'Context information (optional)'
        }
      ]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'columns'
  });

  useEffect(() => {
    if (editingItem && 'dataFormat' in editingItem) {
      reset({
        name: editingItem.name,
        description: editingItem.description || '',
        dataFormat: editingItem.dataFormat,
        columns: editingItem.columns || []
      });
    } else {
      reset({
        name: '',
        description: '',
        dataFormat: 'csv',
        columns: [
          { name: 'userInput', type: 'string', required: true, description: 'User input text' },
          {
            name: 'expectedOutput',
            type: 'string',
            required: true,
            description: 'Expected output'
          }
        ]
      });
    }
  }, [editingItem, reset]);

  const { runAsync: saveDataset, loading: isSaving } = useRequest2(
    async (data: CreateDatasetParams) => {
      if (isEdit && editingItem && 'dataFormat' in editingItem) {
        return await updateDataset(editingItem._id, data);
      } else {
        return await createDataset(data);
      }
    },
    {
      onSuccess: (result) => {
        if (isEdit && editingItem && 'dataFormat' in editingItem) {
          updateDatasetInStore(editingItem._id, result);
          toast({
            title: t('dashboard_evaluation:dataset_updated'),
            status: 'success'
          });
        } else {
          addDataset(result);
          toast({
            title: t('dashboard_evaluation:dataset_created'),
            status: 'success'
          });
        }
        handleClose();
      }
    }
  );

  const handleClose = () => {
    closeDatasetModal();
    reset();
    setSelectedFile(null);
    setUploadProgress(0);
    setImportResult(null);
    setActiveTab(0);
  };

  const addColumn = () => {
    append({
      name: '',
      type: 'string',
      required: false,
      description: ''
    });
  };

  const removeColumn = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  const onSubmit = async (data: CreateDatasetParams) => {
    await saveDataset(data);
  };

  // File upload handlers
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file format
      const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');
      const isJSON = file.type === 'application/json' || file.name.endsWith('.json');

      if (!isCSV && !isJSON) {
        toast({
          title: t('dashboard_evaluation:invalid_file_format'),
          description: t('dashboard_evaluation:only_csv_json_supported'),
          status: 'error'
        });
        return;
      }

      // Validate file size (20MB)
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: t('dashboard_evaluation:file_too_large'),
          description: t('dashboard_evaluation:max_file_size_20mb'),
          status: 'error'
        });
        return;
      }

      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploadProgress(0);

      const result = await importDataset({
        datasetId: editingItem?._id || '',
        file: selectedFile,
        percentListen: (percent) => setUploadProgress(percent)
      });

      setImportResult(result);

      if (result.success) {
        toast({
          title: t('dashboard_evaluation:import_success'),
          description: t('dashboard_evaluation:imported_count', { count: result.importedCount }),
          status: 'success'
        });

        // Refresh dataset data if editing
        if (isEdit) {
          // This would typically trigger a refresh of the dataset
        }
      }
    } catch (error) {
      toast({
        title: t('dashboard_evaluation:import_failed'),
        description: error instanceof Error ? error.message : String(error),
        status: 'error'
      });
    }
  };

  const handleCreateAndUpload = async (data: CreateDatasetParams) => {
    if (!selectedFile) {
      await saveDataset(data);
      return;
    }

    try {
      // First create the dataset
      const newDataset = await saveDataset(data);

      // Then upload the file
      const result = await importDataset({
        datasetId: newDataset._id,
        file: selectedFile,
        percentListen: (percent) => setUploadProgress(percent)
      });

      setImportResult(result);

      if (result.success) {
        toast({
          title: t('dashboard_evaluation:dataset_created_and_imported'),
          description: t('dashboard_evaluation:imported_count', { count: result.importedCount }),
          status: 'success'
        });
        handleClose();
      }
    } catch (error) {
      toast({
        title: t('dashboard_evaluation:create_and_import_failed'),
        description: error instanceof Error ? error.message : String(error),
        status: 'error'
      });
    }
  };

  return (
    <Modal isOpen={showDatasetModal} onClose={handleClose} size="4xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          {isEdit
            ? t('dashboard_evaluation:edit_dataset')
            : t('dashboard_evaluation:create_dataset')}
        </ModalHeader>
        <ModalBody pb={6}>
          {isEdit ? (
            // Edit mode: Show upload tab for existing dataset
            <VStack spacing={6} align="stretch">
              <Tabs index={activeTab} onChange={setActiveTab}>
                <TabList>
                  <Tab>{t('dashboard_evaluation:basic_info')}</Tab>
                  <Tab>{t('dashboard_evaluation:import_data')}</Tab>
                </TabList>

                <TabPanels>
                  <TabPanel px={0}>
                    {/* Basic Info Tab - Same as before */}
                    <VStack spacing={6} align="stretch">
                      <VStack spacing={4} align="stretch">
                        <FormControl isInvalid={!!errors.name}>
                          <FormLabel>{t('dashboard_evaluation:dataset_name')}</FormLabel>
                          <Input
                            {...register('name', { required: true })}
                            placeholder={t('dashboard_evaluation:dataset_name_placeholder')}
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel>{t('dashboard_evaluation:dataset_description')}</FormLabel>
                          <Textarea
                            {...register('description')}
                            placeholder={t('dashboard_evaluation:dataset_description_placeholder')}
                            rows={3}
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel>{t('dashboard_evaluation:data_format')}</FormLabel>
                          <Select {...register('dataFormat')}>
                            <option value="csv">CSV</option>
                            <option value="json">JSON</option>
                          </Select>
                        </FormControl>
                      </VStack>

                      {/* Columns Configuration */}
                      <Box>
                        <HStack justify="space-between" mb={4}>
                          <FormLabel mb={0}>{t('dashboard_evaluation:columns')}</FormLabel>
                          <Button
                            size="sm"
                            leftIcon={<MyIcon name="common/addLight" w={3} />}
                            onClick={addColumn}
                          >
                            {t('common:add')}
                          </Button>
                        </HStack>

                        <TableContainer border="1px" borderColor="gray.200" borderRadius="md">
                          <Table size="sm">
                            <Thead bg="gray.50">
                              <Tr>
                                <Th>{t('dashboard_evaluation:column_name')}</Th>
                                <Th>{t('dashboard_evaluation:column_type')}</Th>
                                <Th>{t('dashboard_evaluation:required')}</Th>
                                <Th>{t('common:description')}</Th>
                                <Th width="60px">{t('dashboard_evaluation:Action')}</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {fields.map((field, index) => (
                                <Tr key={field.id}>
                                  <Td>
                                    <Input
                                      size="sm"
                                      {...register(`columns.${index}.name`, { required: true })}
                                      placeholder={t('dashboard_evaluation:column_name')}
                                    />
                                  </Td>
                                  <Td>
                                    <Select size="sm" {...register(`columns.${index}.type`)}>
                                      <option value="string">
                                        {t('dashboard_evaluation:string_type')}
                                      </option>
                                      <option value="number">
                                        {t('dashboard_evaluation:number_type')}
                                      </option>
                                      <option value="boolean">
                                        {t('dashboard_evaluation:boolean_type')}
                                      </option>
                                    </Select>
                                  </Td>
                                  <Td>
                                    <Checkbox {...register(`columns.${index}.required`)} />
                                  </Td>
                                  <Td>
                                    <Input
                                      size="sm"
                                      {...register(`columns.${index}.description`)}
                                      placeholder={t('common:description')}
                                    />
                                  </Td>
                                  <Td>
                                    <IconButton
                                      aria-label="delete"
                                      size="sm"
                                      variant="ghost"
                                      colorScheme="red"
                                      icon={<MyIcon name="delete" w={3} />}
                                      onClick={() => removeColumn(index)}
                                      isDisabled={fields.length <= 1}
                                    />
                                  </Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </TableContainer>
                      </Box>

                      <HStack justify="flex-end" pt={4}>
                        <Button variant="ghost" onClick={handleClose}>
                          {t('common:cancel')}
                        </Button>
                        <Button
                          onClick={handleSubmit(onSubmit)}
                          isLoading={isSaving}
                          isDisabled={!isValid || fields.length === 0}
                        >
                          {t('common:save')}
                        </Button>
                      </HStack>
                    </VStack>
                  </TabPanel>

                  <TabPanel px={0}>
                    {/* File Upload Tab */}
                    <VStack spacing={6} align="stretch">
                      <Box>
                        <FormLabel mb={4}>{t('dashboard_evaluation:upload_data_file')}</FormLabel>

                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.json"
                          onChange={handleFileSelect}
                          display="none"
                        />

                        <Flex
                          direction="column"
                          align="center"
                          justify="center"
                          border="2px dashed"
                          borderColor={selectedFile ? 'green.300' : 'gray.300'}
                          borderRadius="lg"
                          p={8}
                          cursor="pointer"
                          _hover={{ borderColor: 'blue.400', bg: 'blue.50' }}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <MyIcon name="common/uploadFileFill" w={10} mb={3} color="gray.500" />
                          <Text fontSize="lg" fontWeight="medium" mb={2}>
                            {selectedFile
                              ? selectedFile.name
                              : t('dashboard_evaluation:click_to_upload')}
                          </Text>
                          <Text fontSize="sm" color="gray.500" textAlign="center">
                            {t('dashboard_evaluation:support_csv_json')} •{' '}
                            {t('dashboard_evaluation:max_20mb')}
                          </Text>

                          {selectedFile && (
                            <Box mt={4} textAlign="center">
                              <Text fontSize="sm" color="green.600">
                                {t('dashboard_evaluation:file_selected')}:{' '}
                                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                              </Text>
                            </Box>
                          )}
                        </Flex>
                      </Box>

                      {uploadProgress > 0 && uploadProgress < 100 && (
                        <Box>
                          <Text fontSize="sm" mb={2}>
                            {t('dashboard_evaluation:uploading')}
                          </Text>
                          <Progress value={uploadProgress} colorScheme="blue" />
                        </Box>
                      )}

                      {importResult && (
                        <Alert status={importResult.success ? 'success' : 'error'}>
                          <AlertIcon />
                          <AlertDescription>
                            {importResult.success ? (
                              t('dashboard_evaluation:import_success_message', {
                                count: importResult.importedCount
                              })
                            ) : (
                              <>
                                {t('dashboard_evaluation:import_failed_message')}
                                {importResult.errors && importResult.errors.length > 0 && (
                                  <Box mt={2}>
                                    {importResult.errors.slice(0, 3).map((error, index) => (
                                      <Text key={index} fontSize="xs">
                                        {error}
                                      </Text>
                                    ))}
                                    {importResult.errors.length > 3 && (
                                      <Text fontSize="xs">
                                        {t('dashboard_evaluation:and_more_errors', {
                                          count: importResult.errors.length - 3
                                        })}
                                      </Text>
                                    )}
                                  </Box>
                                )}
                              </>
                            )}
                          </AlertDescription>
                        </Alert>
                      )}

                      <HStack justify="flex-end" pt={4}>
                        <Button variant="ghost" onClick={handleClose}>
                          {t('common:cancel')}
                        </Button>
                        <Button
                          onClick={handleFileUpload}
                          isDisabled={!selectedFile}
                          colorScheme="blue"
                        >
                          {t('dashboard_evaluation:import_data')}
                        </Button>
                      </HStack>
                    </VStack>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </VStack>
          ) : (
            // Create mode: Single form with optional file upload
            <VStack spacing={6} align="stretch">
              {/* Basic Info */}
              <VStack spacing={4} align="stretch">
                <FormControl isInvalid={!!errors.name}>
                  <FormLabel>{t('dashboard_evaluation:dataset_name')}</FormLabel>
                  <Input
                    {...register('name', { required: true })}
                    placeholder={t('dashboard_evaluation:dataset_name_placeholder')}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t('dashboard_evaluation:dataset_description')}</FormLabel>
                  <Textarea
                    {...register('description')}
                    placeholder={t('dashboard_evaluation:dataset_description_placeholder')}
                    rows={3}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t('dashboard_evaluation:data_format')}</FormLabel>
                  <Select {...register('dataFormat')}>
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </Select>
                </FormControl>
              </VStack>

              <Divider />

              {/* Optional File Upload */}
              <Box>
                <FormLabel mb={4}>
                  {t('dashboard_evaluation:optional_upload')}
                  <Text as="span" fontSize="sm" color="gray.500" ml={2}>
                    ({t('dashboard_evaluation:can_upload_later')})
                  </Text>
                </FormLabel>

                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileSelect}
                  display="none"
                />

                <Flex
                  direction="column"
                  align="center"
                  justify="center"
                  border="2px dashed"
                  borderColor={selectedFile ? 'green.300' : 'gray.300'}
                  borderRadius="lg"
                  p={6}
                  cursor="pointer"
                  _hover={{ borderColor: 'blue.400', bg: 'blue.50' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <MyIcon name="common/uploadFileFill" w={8} mb={2} color="gray.500" />
                  <Text fontSize="md" fontWeight="medium" mb={1}>
                    {selectedFile
                      ? selectedFile.name
                      : t('dashboard_evaluation:click_to_upload_optional')}
                  </Text>
                  <Text fontSize="sm" color="gray.500" textAlign="center">
                    {t('dashboard_evaluation:support_csv_json')} •{' '}
                    {t('dashboard_evaluation:max_20mb')}
                  </Text>

                  {selectedFile && (
                    <Box mt={2} textAlign="center">
                      <Text fontSize="sm" color="green.600">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </Text>
                    </Box>
                  )}
                </Flex>
              </Box>

              {/* Columns Configuration */}
              <Box>
                <HStack justify="space-between" mb={4}>
                  <FormLabel mb={0}>{t('dashboard_evaluation:columns')}</FormLabel>
                  <Button
                    size="sm"
                    leftIcon={<MyIcon name="common/addLight" w={3} />}
                    onClick={addColumn}
                  >
                    {t('common:add')}
                  </Button>
                </HStack>

                <TableContainer border="1px" borderColor="gray.200" borderRadius="md">
                  <Table size="sm">
                    <Thead bg="gray.50">
                      <Tr>
                        <Th>{t('dashboard_evaluation:column_name')}</Th>
                        <Th>{t('dashboard_evaluation:column_type')}</Th>
                        <Th>{t('dashboard_evaluation:required')}</Th>
                        <Th>{t('common:description')}</Th>
                        <Th width="60px">{t('dashboard_evaluation:Action')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {fields.map((field, index) => (
                        <Tr key={field.id}>
                          <Td>
                            <Input
                              size="sm"
                              {...register(`columns.${index}.name`, { required: true })}
                              placeholder={t('dashboard_evaluation:column_name')}
                            />
                          </Td>
                          <Td>
                            <Select size="sm" {...register(`columns.${index}.type`)}>
                              <option value="string">
                                {t('dashboard_evaluation:string_type')}
                              </option>
                              <option value="number">
                                {t('dashboard_evaluation:number_type')}
                              </option>
                              <option value="boolean">
                                {t('dashboard_evaluation:boolean_type')}
                              </option>
                            </Select>
                          </Td>
                          <Td>
                            <Checkbox {...register(`columns.${index}.required`)} />
                          </Td>
                          <Td>
                            <Input
                              size="sm"
                              {...register(`columns.${index}.description`)}
                              placeholder={t('common:description')}
                            />
                          </Td>
                          <Td>
                            <IconButton
                              aria-label="delete"
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              icon={<MyIcon name="delete" w={3} />}
                              onClick={() => removeColumn(index)}
                              isDisabled={fields.length <= 1}
                            />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              </Box>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <Box>
                  <Text fontSize="sm" mb={2}>
                    {t('dashboard_evaluation:uploading')}
                  </Text>
                  <Progress value={uploadProgress} colorScheme="blue" />
                </Box>
              )}

              {importResult && (
                <Alert status={importResult.success ? 'success' : 'error'}>
                  <AlertIcon />
                  <AlertDescription>
                    {importResult.success
                      ? t('dashboard_evaluation:import_success_message', {
                          count: importResult.importedCount
                        })
                      : t('dashboard_evaluation:import_failed_message')}
                  </AlertDescription>
                </Alert>
              )}

              {/* Actions */}
              <HStack justify="flex-end" pt={4}>
                <Button variant="ghost" onClick={handleClose}>
                  {t('common:cancel')}
                </Button>
                <Button
                  onClick={handleSubmit(selectedFile ? handleCreateAndUpload : onSubmit)}
                  isLoading={isSaving}
                  isDisabled={!isValid || fields.length === 0}
                >
                  {selectedFile ? t('dashboard_evaluation:create_and_import') : t('common:create')}
                </Button>
              </HStack>
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default DatasetModal;
