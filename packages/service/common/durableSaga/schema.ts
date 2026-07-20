import type { DurableSagaSnapshot } from '@fastgpt-sdk/durable-saga';
import { connectionMongo, getMongoModel } from '../mongo';

const { Schema } = connectionMongo;

const durableSagaInstanceCollection = 'durable_saga_instances';
const durableSagaReservationCollection = 'durable_saga_reservations';

type DurableSagaReservationSchemaType = {
  _id: string;
  ownerSagaId: string;
};

const SerializedErrorSchema = new Schema(
  {
    name: { type: String, required: true },
    message: { type: String, required: true },
    code: String,
    details: Schema.Types.Mixed
  },
  { _id: false, strict: 'throw' }
);

const CurrentStepSchema = new Schema(
  {
    stepId: { type: String, required: true },
    phase: { type: String, enum: ['started', 'uncertain'], required: true },
    executeAttempts: { type: Number, required: true },
    reconcileAttempts: { type: Number, required: true },
    idempotencyKey: { type: String, required: true },
    startedAt: { type: Date, required: true },
    takeoverNotBefore: { type: Date, required: true },
    lastError: SerializedErrorSchema
  },
  { _id: false, strict: 'throw' }
);

const ExecutionSchema = new Schema(
  {
    token: { type: String, required: true },
    epoch: { type: Number, required: true },
    heartbeatAt: { type: Date, required: true }
  },
  { _id: false, strict: 'throw' }
);

const DurableSagaInstanceSchema = new Schema(
  {
    _id: { type: String, required: true },
    sagaId: { type: String, required: true },
    name: { type: String, required: true },
    version: { type: Number, required: true },
    manifestSignature: { type: String, required: true },
    inputHash: { type: String, required: true },
    reservationKeys: { type: [String], required: true },
    status: {
      type: String,
      enum: ['pending', 'running', 'waiting', 'blocked', 'completed', 'failed'],
      required: true
    },
    input: { type: Schema.Types.Mixed, required: true },
    state: { type: Schema.Types.Mixed, required: true },
    nextStepIndex: { type: Number, required: true },
    executionEpoch: { type: Number, required: true },
    currentStep: CurrentStepSchema,
    execution: ExecutionSchema,
    nextRunAt: Date,
    revision: { type: Number, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    completedAt: Date,
    lastError: SerializedErrorSchema
  },
  { strict: 'throw', versionKey: false, minimize: false }
);

DurableSagaInstanceSchema.index({ sagaId: 1 }, { unique: true });
DurableSagaInstanceSchema.index({ status: 1, nextRunAt: 1, sagaId: 1 });
DurableSagaInstanceSchema.index({ status: 1, 'execution.heartbeatAt': 1, sagaId: 1 });
const DurableSagaReservationSchema = new Schema(
  {
    _id: { type: String, required: true },
    ownerSagaId: { type: String, required: true }
  },
  { strict: 'throw', versionKey: false }
);

DurableSagaReservationSchema.index({ ownerSagaId: 1 });

export const MongoDurableSagaInstance = getMongoModel<DurableSagaSnapshot & { _id: string }>(
  durableSagaInstanceCollection,
  DurableSagaInstanceSchema
);
export const MongoDurableSagaReservation = getMongoModel<DurableSagaReservationSchemaType>(
  durableSagaReservationCollection,
  DurableSagaReservationSchema
);
