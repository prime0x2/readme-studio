import type { Env } from "./env";
import { handleApi, purgeExpired } from "./shares";

/**
 * ReadmeStudio's Worker. wrangler.jsonc routes only /api/* here
 * (run_worker_first); every other request is served from dist/ by the
 * assets binding, as before. A daily cron purges expired shares.
 */
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },

  async scheduled(
    _controller: unknown,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<void> {
    ctx.waitUntil(purgeExpired(env.DB, Date.now()));
  },
};
