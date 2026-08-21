import { defineIndex, Schema, getMongoModel } from '../../mongo';

const DatasetFileSchema = new Schema({
  metadata: Object
});
const ChatFileSchema = new Schema({
  metadata: Object
});

defineIndex(DatasetFileSchema, { key: { uploadDate: -1 } });

defineIndex(ChatFileSchema, { key: { uploadDate: -1 } });
defineIndex(ChatFileSchema, { key: { 'metadata.chatId': 1 } });

export const MongoDatasetFileSchema = getMongoModel('dataset.files', DatasetFileSchema);
export const MongoChatFileSchema = getMongoModel('chat.files', ChatFileSchema);
