// import React, { useEffect } from 'react';
// import dynamic from 'next/dynamic';
// import { useTranslation } from 'next-i18next';
// import { useFieldArray, useForm } from 'react-hook-form';
// import {
//   Box,
//   Button,
//   Flex,
//   Table,
//   Thead,
//   Tbody,
//   Tr,
//   Th,
//   Td,
//   TableContainer,
//   Input
// } from '@chakra-ui/react';
// import Loading from '@fastgpt/web/components/common/MyLoading';
// import { useContextSelector } from 'use-context-selector';
// import { DatasetImportContext } from '../Context';
// import { getFileIcon } from '@fastgpt/global/common/file/icon';
// import { getDatasetCollectionById, getPutifileFileUrl } from '@/web/core/dataset/api';

// const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
//   loading: () => <Loading fixed={false} />
// });
// const Upload = dynamic(() => import('../commonProgress/Upload'));

// const PutifileFileCollection = () => {
//   const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

//   return (
//     <>
//       {activeStep === 0 && <CustomLinkInput />}
//       {activeStep === 1 && <DataProcess showPreviewChunks={true} />}
//       {activeStep === 2 && <Upload />}
//     </>
//   );
// };

// export default React.memo(PutifileFileCollection);

// const CustomLinkInput = () => {
//   const { t } = useTranslation();
//   const { goToNext, sources, setSources } = useContextSelector(DatasetImportContext, (v) => v);
//   const { register, reset, handleSubmit, control } = useForm<{
//     list: {
//       collectionId: string;
//       sourceName: string;
//       externalFileUrl: string;
//       externalFileId: string;
//     }[];
//   }>({
//     defaultValues: {
//       list: [
//         {
//           sourceName: '',
//           externalFileUrl: '',
//           externalFileId: ''
//         }
//       ]
//     }
//   });

//   const {
//     fields: list,
//     update
//   } = useFieldArray({
//     control,
//     name: 'list'
//   });

//   useEffect(() => {

//     // 从url中获取collectionId
//     const quer = new URLSearchParams(window.location.search);
//     const datasetId = quer.get('datasetId');
//     const collectionId = quer.get('collectionId');
//     // 更具collectionId获取到已有集合信息
//     if (collectionId) {
//         getDatasetCollectionById(collectionId || '')
//             .then((res) => {
//                 // 获取文件访问地址
//                 getPutifileFileUrl(res.externalFileId || '').then((fileUrl) => {
//                     reset({
//                         list: [
//                             {
//                                 collectionId: collectionId || '',
//                                 sourceName: res.name || '',
//                                 externalFileUrl:  fileUrl || '',
//                                 externalFileId: res.externalFileId || ''
//                             }
//                         ]
//                     });
//                 });
//             });
//     }
//   }, []);

//   return (
//     <Box>
//       <TableContainer>
//         <Table bg={'white'}>
//           <Thead>
//             <Tr bg={'myGray.50'}>
//               <Th>文件访问地址</Th>
//               <Th>文件ID</Th>
//               <Th>文件名称</Th>
//               <Th></Th>
//             </Tr>
//           </Thead>
//           <Tbody>
//             {list.map((item, index) => (
//               <Tr key={item.id}>
//                 <Td>
//                   <Input
//                     {...register(`list.${index}.externalFileUrl`, {
//                       required: index !== list.length - 1,
//                       onBlur(e) {
//                         const val = (e.target.value || '') as string;
//                         if (val.includes('.') && !list[index]?.sourceName) {
//                           const sourceName = val.split('/').pop() || '';
//                           update(index, {
//                             ...list[index],
//                             externalFileUrl: val,
//                             sourceName: decodeURIComponent(sourceName)
//                           });
//                         }
//                         // if (val && index === list.length - 1) {
//                         //   append({
//                         //     sourceName: '',
//                         //     externalFileUrl: '',
//                         //     externalFileId: ''
//                         //   });
//                         // }
//                       }
//                     })}
//                   />
//                 </Td>
//                 <Td>
//                   <Input {...register(`list.${index}.externalFileId`)} />
//                 </Td>
//                 <Td>
//                   <Input {...register(`list.${index}.sourceName`)} />
//                 </Td>
//               </Tr>
//             ))}
//           </Tbody>
//         </Table>
//       </TableContainer>
//       <Flex mt={5} justifyContent={'space-between'}>
//         <Button
//           isDisabled={list.filter((item) => !!item.externalFileUrl).length === 0}
//           onClick={handleSubmit((data) => {
//             setSources(
//               data.list
//                 .filter((item) => !!item.externalFileUrl)
//                 .map((item) => ({
//                   id: item.collectionId,
//                   createStatus: 'waiting',
//                   sourceName: item.sourceName || item.externalFileUrl,
//                   icon: getFileIcon(item.externalFileUrl),
//                   externalFileId: item.externalFileId,
//                   externalFileUrl: item.externalFileUrl
//                 }))
//             );

//             goToNext();
//           })}
//         >
//           {t('common:common.Next Step')}
//         </Button>
//       </Flex>
//     </Box>
//   );
// };
