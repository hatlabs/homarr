import { createLogger } from "@homarr/core/infrastructure/logs";
import { ErrorWithMetadata } from "@homarr/core/infrastructure/logs/error";
import { EVERY_MINUTE } from "@homarr/cron-jobs-core/expressions";
import { db } from "@homarr/db";
import { getServerSettingByKeyAsync } from "@homarr/db/queries";
import { sendPingRequestAsync } from "@homarr/ping";
import { pingChannel, pingUrlChannel } from "@homarr/redis";

import { createCronJob } from "../lib";

const logger = createLogger({ module: "pingJobs" });

const resetPreviousUrlsAsync = async () => {
  await pingUrlChannel.clearAsync();
  logger.info("Cleared previous ping urls");
};

export const pingJob = createCronJob("ping", EVERY_MINUTE, {
  beforeStart: resetPreviousUrlsAsync,
}).withCallback(async () => {
  const boardSettings = await getServerSettingByKeyAsync(db, "board");

  if (boardSettings.forceDisableStatus) {
    logger.debug("Simple ping is disabled by server settings");
    return;
  }

  const entries = await pingUrlChannel.getAllAsync();

  // Dedup by id — multiple subscribers for the same app coalesce into one ping.
  // (Two distinct apps that happen to share a URL still ping independently.)
  const uniqueById = new Map<string, { id: string; url: string }>();
  for (const entry of entries) {
    if (!uniqueById.has(entry.id)) uniqueById.set(entry.id, entry);
  }

  await Promise.allSettled([...uniqueById.values()].map(pingAsync));
});

const pingAsync = async ({ id, url }: { id: string; url: string }) => {
  const pingResult = await sendPingRequestAsync(url);

  if ("statusCode" in pingResult) {
    logger.debug("Executed ping successfully", { id, url, statusCode: pingResult.statusCode });
  } else {
    logger.error(new ErrorWithMetadata("Executing ping failed", { id, url }, { cause: pingResult.error }));
  }

  await pingChannel.publishAsync({
    id,
    url,
    ...pingResult,
  });
};
