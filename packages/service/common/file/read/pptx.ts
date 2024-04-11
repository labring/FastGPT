import { ReadFileByBufferParams, ReadFileResponse } from './type.d';
// import { parseOfficeAsync } from 'officeparser';
import { parseOffice } from './parseOffice';

export const readPptxRawText = async ({
  buffer,
  encoding
}: ReadFileByBufferParams): Promise<ReadFileResponse> => {
  const result = await parseOffice({
    buffer,
    encoding: encoding as BufferEncoding,
    extension: 'pptx'
  });

  return {
    rawText: result
  };
};
