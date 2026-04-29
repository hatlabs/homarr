import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { z } from "zod/v4";

import { resolveServerUrl } from "@homarr/common";
import { getServerSettingByKeyAsync } from "@homarr/db/queries";
import { sendPingRequestAsync } from "@homarr/ping";
import type { PingResult } from "@homarr/redis";
import { pingChannel, pingUrlChannel } from "@homarr/redis";

import { createTRPCRouter, publicProcedure } from "../../trpc";
import { AppRepository } from "../app";

export const appRouter = createTRPCRouter({
  ping: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const boardSettings = await getServerSettingByKeyAsync(ctx.db, "board");
    if (boardSettings.forceDisableStatus) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Ping functionality is disabled by server settings",
      });
    }

    const repository = new AppRepository(ctx.db, ctx.session?.user ?? null);
    const app = await repository.getByIdAsync(input.id);

    if (!app) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "App not found",
      });
    }

    const pingUrl = resolveServerUrl(app, ctx.headers);

    if (!pingUrl) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "No URL to ping configured for this app",
      });
    }

    const pingResult = await sendPingRequestAsync(pingUrl);

    return {
      url: pingUrl,
      ...pingResult,
    };
  }),
  updatedPing: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .subscription(async ({ ctx, input }) => {
      const boardSettings = await getServerSettingByKeyAsync(ctx.db, "board");
      if (boardSettings.forceDisableStatus) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Ping functionality is disabled by server settings",
        });
      }

      const repository = new AppRepository(ctx.db, ctx.session?.user ?? null);
      const app = await repository.getByIdAsync(input.id);

      if (!app) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "App not found",
        });
      }

      const pingUrl = resolveServerUrl(app, ctx.headers);

      if (!pingUrl) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "No URL to ping configured for this app",
        });
      }

      const entry = { id: app.id, url: pingUrl };
      await pingUrlChannel.addAsync(entry);

      return observable<PingResult>((emit) => {
        const unsubscribe = pingChannel.subscribe((message) => {
          // Filter by app id rather than URL: path-only hrefs resolve to
          // different absolute URLs across clients on different hostnames,
          // but the app id is stable.
          if (message.id !== app.id) return;
          emit.next(message);
        });

        return () => {
          unsubscribe();
          void pingUrlChannel.removeAsync(entry);
        };
      });
    }),
});
