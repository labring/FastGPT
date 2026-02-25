import type { TrackEventName } from '@/web/common/system/constants';

declare global {
  var qaQueueLen: number;
  var vectorQueueLen: number;
  var datasetParseQueueLen: number;

  interface Window {
    grecaptcha: any;
    QRCode: any;
    umami?: {
      track: (event: TrackEventName, data: any) => void;
    };
  }
}
