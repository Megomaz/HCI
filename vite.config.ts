import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Local stand-in for the hosting platform: serves the functions in /api during
 * `npm run dev`, so live mode (?live=1) can be tried without deploying.
 * Put ANTHROPIC_API_KEY in .env.local (never committed). Demo mode needs none of this.
 */
function apiDuringDev(): Plugin {
  return {
    name: "translate-api-during-dev",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
      }

      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/(simplify|explain)(?:\?.*)?$/);
        if (!match) return next();

        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`);
          const handler: unknown = mod[req.method ?? "GET"];
          if (typeof handler !== "function") {
            res.statusCode = 405;
            res.end();
            return;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: { "Content-Type": req.headers["content-type"] ?? "application/json" },
            body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
          });

          const response = (await handler(request)) as Response;
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          console.error(error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Server error" }));
        }
      });
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the built site works at a domain root (Vercel, Netlify)
  // and in a sub-folder (GitHub Pages serves it at /HCI/).
  base: "./",
  plugins: [apiDuringDev()],
});
