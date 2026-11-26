import type { TrackEventName } from '@/web/common/system/constants';

declare global {
  interface Window {
    QRCode: any;
    umami?: {
      track: (event: TrackEventName, data: any) => void;
    };
  }
}
