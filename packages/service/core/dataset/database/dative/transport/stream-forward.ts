import { request } from 'undici';
import { PassThrough, type Readable } from 'stream';
import { addLog } from '../../../../../common/system/log';
import { parseDativeErrorResponse } from '../utils';

export interface StreamForwardConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string | string[]>;
  timeout?: number;
  query?: Record<string, string | number | boolean>;
}

// Multipart field injector configuration
export interface MultipartFieldInjector {
  name: string;
  value: string | Record<string, any>;
  contentType?: string;
}

// Options for multipart stream forwarding
export interface MultipartForwardOptions extends StreamForwardConfig {
  requestStream: Readable;
  contentType: string;
  injectFields?: MultipartFieldInjector[];
}

/**
 * Generic response type for stream forward operations
 */
export interface StreamForwardResponse<T = any> {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: T;
  rawBody?: string;
}

function extractBoundary(contentType: string): string {
  const boundaryMatch = contentType.match(/boundary=["']?([^"';]+)["']?/i);

  if (!boundaryMatch || !boundaryMatch[1] || boundaryMatch[1].trim() === '') {
    addLog.error('Failed to extract boundary from Content-Type', {
      contentType,
      expectedFormat: 'multipart/form-data; boundary=xxx'
    });
    throw new Error(
      'Invalid multipart boundary in Content-Type header. ' +
        'Expected format: multipart/form-data; boundary=xxx'
    );
  }

  const boundary = boundaryMatch[1].trim();

  addLog.debug('Extracted boundary from Content-Type', {
    contentType,
    boundary,
    boundaryLength: boundary.length
  });

  return boundary;
}

// Create a multipart field part as a string
function createMultipartField(field: MultipartFieldInjector, boundary: string): string {
  const value = typeof field.value === 'string' ? field.value : JSON.stringify(field.value);

  let part = `--${boundary}\r\n`;
  part += `Content-Disposition: form-data; name="${field.name}"\r\n`;

  if (field.contentType) {
    part += `Content-Type: ${field.contentType}\r\n`;
  }

  part += `\r\n${value}\r\n`;

  return part;
}

function combineMultipartStreams(
  originalStream: Readable,
  boundary: string,
  injectFields?: MultipartFieldInjector[]
): Readable {
  const combined = new PassThrough();
  try {
    // Write injected fields first
    if (injectFields && injectFields.length > 0) {
      for (const field of injectFields) {
        const fieldPart = createMultipartField(field, boundary);
        combined.write(fieldPart);

        addLog.debug('Injected multipart field', {
          fieldName: field.name,
          fieldLength: fieldPart.length
        });
      }
    }

    // Pipe original stream (which should contain file parts and ending boundary)
    originalStream.pipe(combined, { end: true });

    return combined;
  } catch (error) {
    combined.destroy();
    throw new Error(`Failed to combine multipart streams: ${String(error)}`);
  }
}

function prepareRequestHeaders(
  headers: Record<string, string | string[]>,
  contentType: string
): Record<string, string> {
  const requestHeaders: Record<string, string> = {
    ...headers,
    'content-type': contentType
  };

  // Remove content-length as combined stream may have different length
  delete requestHeaders['content-length'];

  addLog.debug('Prepared request headers', {
    contentType,
    hasCustomHeaders: Object.keys(headers).length > 0
  });

  return requestHeaders;
}

function destroyStream(stream: Readable): void {
  stream.destroy();
}

export async function forwardMultipartStream<TResponse = any>(
  options: MultipartForwardOptions
): Promise<StreamForwardResponse<TResponse>> {
  const {
    url,
    method = 'POST',
    headers = {},
    timeout = 300000,
    requestStream,
    contentType,
    injectFields
  } = options;

  addLog.debug('Starting multipart stream forward', {
    url,
    method,
    hasInjectedFields: Boolean(injectFields && injectFields.length > 0),
    timeout
  });

  const boundary = extractBoundary(contentType);

  const finalStream =
    injectFields && injectFields.length > 0
      ? combineMultipartStreams(requestStream, boundary, injectFields)
      : requestStream;

  const requestHeaders = prepareRequestHeaders(headers, contentType);

  try {
    const response = await request(url, {
      method,
      headers: requestHeaders,
      body: finalStream as any,
      bodyTimeout: timeout,
      headersTimeout: timeout
    });

    addLog.debug('Stream forward response received', {
      url,
      statusCode: response.statusCode
    });

    // Parse response body
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks as any).toString('utf-8');

    if (response.statusCode !== 200) {
      // Clean up request stream on error response
      destroyStream(finalStream);
      return Promise.reject(
        parseDativeErrorResponse({ statusCode: response.statusCode, data: rawBody })
      );
    }

    return {
      statusCode: response.statusCode,
      headers: response.headers as Record<string, string | string[]>,
      body: JSON.parse(rawBody) as TResponse,
      rawBody
    };
  } catch (error) {
    // Ensure stream cleanup on any exception
    destroyStream(finalStream);
    return Promise.reject(`Upload failed: ${String(error)}`);
  }
}
