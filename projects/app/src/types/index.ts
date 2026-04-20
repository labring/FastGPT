import type { TrackEventName } from '@/web/common/system/constants';

declare global {
  var parseQueueLen: number;
  var qaQueueLen: number;
  var vectorQueueLen: number;
  var datasetParseQueueLen: number;
  var small2bigQueueLen: number;
  var synthesisQueueLen: number;

  interface Window {
    grecaptcha: any;
    QRCode: any;
    umami?: {
      track: (event: TrackEventName, data: any) => void;
    };
  }
}
