import type { LogLevel } from "@homarr/core/infrastructure/logs/constants";

import { createListChannel, createQueueChannel, createSubPubChannel } from "./lib/channel";

export {
  createCacheChannel,
  createItemAndIntegrationChannel,
  createItemChannel,
  createIntegrationOptionsChannel,
  createWidgetOptionsChannel,
  createChannelWithLatestAndEvents,
  createChannelEventHistory,
  handshakeAsync,
  createSubPubChannel,
  createGetSetChannel,
} from "./lib/channel";

export { createIntegrationHistoryChannel } from "./lib/channels/history-channel";

export const exampleChannel = createSubPubChannel<{ message: string }>("example");

// Ping pub/sub messages and the list of pending entries are keyed by the
// owning app's id rather than its URL. Path-only `app.href` values resolve to
// different absolute URLs across clients on different hostnames; using the
// stable `app.id` keeps subscribers correctly matched.
export interface PingEntry {
  id: string;
  url: string;
}
export type PingResult =
  | { id: string; url: string; statusCode: number; durationMs: number }
  | { id: string; url: string; error: string };
export const pingChannel = createSubPubChannel<PingResult>("ping");
export const pingUrlChannel = createListChannel<PingEntry>("ping-url");

export const homeAssistantEntityState = createSubPubChannel<{
  entityId: string;
  state: string;
}>("home-assistant/entity-state");

export const queueChannel = createQueueChannel<{
  name: string;
  executionDate: Date;
  data: unknown;
}>("common-queue");

export interface LoggerMessage {
  message: string;
  level: LogLevel;
}

export const loggingChannel = createSubPubChannel<LoggerMessage>("logging");
