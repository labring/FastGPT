import type { AppFileSelectConfigType } from '../../app/type/config.schema';

/**
 * Home Chat 的服务端上传白名单。
 *
 * 前端可以根据当前模型能力收窄图片入口，但不能扩大这里定义的文件类型范围。
 */
export const homeChatFileSelectConfig: AppFileSelectConfigType = {
  maxFiles: 20,
  canSelectFile: true,
  canSelectImg: true,
  canSelectVideo: false,
  canSelectAudio: false,
  canSelectCustomFileExtension: false,
  customFileExtensionList: []
};
