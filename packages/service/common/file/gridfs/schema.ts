import { Schema, getMongoModel } from '../../mongo';

const DatasetFileSchema = new Schema({
  metadata: Object
});
const ChatFileSchema = new Schema({
  metadata: Object
});

DatasetFileSchema.index({ uploadDate: -1 });

ChatFileSchema.index({ uploadDate: -1 });
ChatFileSchema.index({ 'metadata.chatId': 1 });

export const MongoDatasetFileSchema = getMongoModel('dataset.files', DatasetFileSchema);
export const MongoChatFileSchema = getMongoModel('chat.files', ChatFileSchema);
