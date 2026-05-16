import { imageFileType } from '@fastgpt/global/common/file/constants';

// Keep the disabled upload path in place so the search test flow can enable images by flag only.
export const SEARCH_TEST_IMAGE_UPLOAD_ENABLED = true;
export const MAX_SEARCH_TEST_IMAGE_COUNT = 10;

// Derive accepted extensions from the shared upload accept string to avoid frontend/backend drift.
export const IMAGE_EXTENSION_SET = new Set(
  imageFileType
    .split(',')
    .map((item) => item.trim().replace('.', '').toLowerCase())
    .filter(Boolean)
);

export const searchTestImageThumbProps = {
  w: '80px',
  h: '80px',
  alignItems: 'center',
  justifyContent: 'center',
  bg: 'white',
  border: '1.07143px solid',
  borderColor: 'borderColor.low',
  borderRadius: '8px',
  boxShadow:
    '0px 4.28571px 10.7143px rgba(19, 51, 107, 0.08), 0px 0px 1.07143px rgba(19, 51, 107, 0.08)'
} as const;
