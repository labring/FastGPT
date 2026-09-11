import FormData from 'form-data';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { parseMarkdownBase64Images } from '@fastgpt/global/common/string/markdown';
import z from 'zod';
import { axios } from '../../common/api/axios';
import { getImageBuffer } from '../../common/file/image/utils';
import { uploadParsedPdfImage, type ParsedPdfImageKeyOptions } from '../../common/file/read/image';
import { serviceEnv } from '../../env';

const SangforParseResponseSchema = z.object({
  pages: z.number().int().nonnegative(),
  markdown: z.string()
});

/** Only configured formats use Sangfor; other files retain the original parser chain. */
export const useSangforParse = (extension: string): boolean => {
  if (serviceEnv.DOCUMENT_PARSE_PROVIDER !== 'sangfor') return false;
  if (!global.systemEnv?.customPdfParse?.url) return false;

  const normalizeExtension = (value: string) => value.trim().toLowerCase().replace(/^\./, '');
  const extensions = serviceEnv.SANGFOR_PARSE_EXTENSIONS.split(',')
    .map(normalizeExtension)
    .filter(Boolean);
  return extensions.includes(normalizeExtension(extension));
};

/**
 * Parses an already materialized document through Sangfor while preserving the legacy
 * custom-service protocol. File source materialization stays in the caller.
 */
export const parseFromSangfor = async ({
  fileBuffer,
  extension,
  imageKeyOptions
}: {
  fileBuffer: Buffer;
  extension: string;
  imageKeyOptions?: ParsedPdfImageKeyOptions;
}) => {
  const { url, key } = global.systemEnv?.customPdfParse ?? {};
  if (!url) {
    throw new Error('[sangfor] global.systemEnv.customPdfParse.url is required');
  }

  try {
    const form = new FormData();
    form.append('file', fileBuffer, { filename: `file.${extension}` });
    const { data } = await axios.post<unknown>(url, form, {
      timeout: serviceEnv.SANGFOR_PARSE_TIMEOUT_SECONDS * 1000,
      headers: {
        ...form.getHeaders(),
        Authorization: key ? `Bearer ${key}` : undefined
      }
    });

    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw data.error;
    }

    const response = SangforParseResponseSchema.parse(data);
    const text = await parseMarkdownBase64Images(response.markdown, {
      parseBase64: true,
      parseHttp: true,
      controller: imageKeyOptions?.prefix
        ? async (image) => {
            if (image.type === 'base64') {
              return uploadParsedPdfImage(
                {
                  type: 'base64',
                  mime: image.mime,
                  dataUrl: image.dataUrl
                },
                imageKeyOptions
              );
            }

            const { buffer, mime } = await getImageBuffer(image.url);
            return uploadParsedPdfImage(
              {
                type: 'http',
                mime,
                buffer
              },
              imageKeyOptions
            );
          }
        : undefined
    });

    return {
      pages: response.pages,
      text
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[sangfor]')) throw error;
    throw new Error(`[sangfor] ${getErrText(error)}`);
  }
};
