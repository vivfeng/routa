import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { searchSfMarinAddresses } from "./api/_lib/geocode.js";

function geocodeDevMiddleware() {
  return {
    name: "routa-geocode-dev-middleware",
    configureServer(server) {
      server.middlewares.use("/api/geocode", async (req, res) => {
        const requestUrl = new URL(req.url, "http://127.0.0.1");
        const query = requestUrl.searchParams.get("q")?.trim() || "";

        res.setHeader("Content-Type", "application/json");

        if (!query) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Missing q query parameter." }));
          return;
        }

        try {
          const candidates = await searchSfMarinAddresses(query);
          if (!candidates.length) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Address not found." }));
            return;
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ best: candidates[0], candidates }));
        } catch {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: "Geocoding unavailable." }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), geocodeDevMiddleware()],
  server: {
    port: parseInt(process.env.PORT) || 5174,
  },
});
