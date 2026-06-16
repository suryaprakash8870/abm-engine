/** Public surface of the event bus. Engines import from here. */
export * from './types';
export * from './catalog';
export * from './envelope';
export { publishEvent, eventQueue } from './publish';
export { subscribeToEvent, registeredWorkers, type EventHandler, type SubscribeOptions } from './consume';
export { sendToDeadLetter } from './dead-letter';
export { fakeEvent, withCapturedEvents, recordIfCapturing } from './test-harness';
