import app from "./index";

const server = Bun.serve({
  port: 4000,
  fetch(request) {
    return app.fetch(request);
  }
});

console.log(`FishyStream scraper listening on http://localhost:${server.port}`);
