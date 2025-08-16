import { useQuery } from '@tanstack/react-query';
import { GET } from '@/web/common/api/request';

export type PdfParserOption = {
  value: string;
  label: string;
  desc: string;
  price: number;
  supportedFormats: string[];
};

export const usePdfParsers = () => {
  return useQuery({
    queryKey: ['getPdfParsers'],
    queryFn: () => GET<PdfParserOption[]>('/system/getPdfParsers'),
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
};
