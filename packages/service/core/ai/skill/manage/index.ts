/**
 * Skill 管理域统一出口。
 *
 * 只聚合 skill/folder 的 CRUD、导入与 AI 初始创建流程；版本发布、编辑沙盒和包归档
 * 分别由 version、edit、package 目录负责，避免管理入口继续膨胀。
 */
export * from './types';
export * from './create';
export * from './update';
export * from './query';
export * from './folder';
export * from './delete';
export * from './import';
