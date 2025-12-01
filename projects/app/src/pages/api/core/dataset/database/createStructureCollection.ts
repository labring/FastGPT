import type { NextApiRequest } from 'next';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { dativeUrl } from '@fastgpt/service/core/dataset/search/controller';
import type { DativeExcelUploadResponse } from '@fastgpt/global/core/dataset/database/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(req: NextApiRequest): Promise<CreateCollectionResponse> {
  // Validate Dative service URL
  if (!dativeUrl) {
    return Promise.reject(new Error('Dative service URL is not configured'));
  }

  // Extract datasetId from query
  const datasetId = req.query.datasetId as string;
  if (!datasetId) {
    return Promise.reject(new Error('datasetId is required'));
  }

  // Authenticate dataset access
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: datasetId
  });

  return new Promise((resolve, reject) => {
    // Read boundary from original request
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);

    if (!boundaryMatch) {
      return reject(new Error('Invalid multipart boundary'));
    }

    const boundary = boundaryMatch[1];

    // Prepare source_config field
    const sourceConfig = JSON.stringify({
      type: 'mongo',
      bucket: 'dataset',
      kid: datasetId,
      metadata: {
        teamId,
        uid: tmbId
      }
    });

    // 1) Construct source_config multipart part
    const prependPart =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="source_config"\r\n\r\n` +
      `${sourceConfig}\r\n`;

    // 2) Construct ending boundary
    const endPart = `\r\n--${boundary}--`;

    // 3) Combine streams: prepend + original request + end
    const combined = require('combined-stream').create();
    combined.append(prependPart);
    combined.append(req); // Original file stream, no parsing needed!
    combined.append(endPart);

    addLog.debug('Sending request to Dative with combined stream', {
      url: `${dativeUrl}/api/v1/data_source/excel_upload`,
      sourceConfig
    });

    // Prepare request to Dative service
    const parsedUrl = new URL(`${dativeUrl}/api/v1/data_source/excel_upload`);
    const requestFn = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;

    // Prepare headers - remove content-length as combined stream will set it
    const { 'content-length': _, ...restHeaders } = req.headers;
    const requestHeaders = {
      ...restHeaders,
      host: parsedUrl.hostname
    };

    const dativeRequest = requestFn(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: requestHeaders,
        timeout: 300000 // 5 minutes timeout
      },
      (dativeResponse) => {
        let responseData = '';

        dativeResponse.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        dativeResponse.on('end', async () => {
          try {
            // Check response status
            if (dativeResponse.statusCode !== 200) {
              let errorData;
              try {
                errorData = JSON.parse(responseData);
              } catch (e) {
                errorData = { detail: responseData };
              }

              addLog.error('Dative service error', {
                status: dativeResponse.statusCode,
                error: errorData
              });

              const errorMsg =
                errorData.detail || errorData.message || responseData || 'Unknown error';

              return reject(new Error(`File upload failed: ${errorMsg}`));
            }

            // Parse Dative response
            const dativeResult: DativeExcelUploadResponse = JSON.parse(responseData);

            if (dativeResult.msg !== 'success') {
              return reject(new Error(`Dative service failed: ${dativeResult.msg}`));
            }
            console.debug(JSON.stringify(dativeResult, null, 2));
            const { file_id: fileId, rows, cols, filename } = dativeResult;

            addLog.info('File processed by Dative', {
              fileId,
              filename,
              rows,
              cols
            });

            // Create collection in database using createOneCollection
            const collection = await createOneCollection({
              name: filename,
              teamId,
              tmbId,
              datasetId: dataset._id,
              type: DatasetCollectionTypeEnum.file,
              fileId,
              metadata: {
                rows,
                cols
              }
            });

            addLog.info('Collection created successfully', {
              collectionId: collection._id,
              filename
            });

            resolve({
              collectionId: collection._id,
              results: {
                insertLen: 0
              }
            });
          } catch (error) {
            addLog.error('Error processing Dative response', {
              error: error instanceof Error ? error.message : String(error)
            });
            reject(error);
          }
        });
      }
    );

    // Handle request errors
    dativeRequest.on('error', (error) => {
      addLog.error('Dative request error', { error: error.message });
      dativeRequest.destroy();
      reject(new Error(`Dative service request failed: ${error.message}`));
    });

    dativeRequest.on('timeout', () => {
      addLog.error('Dative request timeout');
      dativeRequest.destroy();
      reject(new Error('Dative service request timeout'));
    });

    // 4) Pipe combined stream to Dative
    combined.pipe(dativeRequest);
  });
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default NextAPI(handler);
