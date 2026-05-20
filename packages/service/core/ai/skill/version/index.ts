/**
 * Skill 版本域统一出口。
 *
 * 负责版本记录的创建、查询、激活、更新和删除；不直接处理 ZIP 解包或编辑沙盒文件，
 * 这些底层动作由 package/edit 模块完成后把结果交给版本模块落库。
 */
export * from './types';
export * from './create';
export * from './query';
export * from './active';
export * from './delete';
export * from './update';
