import express from "express";

/** Creates the HTTP application without binding a network port. */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/readyz", (_request, response) => {
    response.status(200).json({ status: "ready" });
  });

  app.get("/metrics", (_request, response) => {
    response
      .status(200)
      .type("text/plain")
      .send('repomedic_api_info{service="api"} 1\n');
  });

  return app;
}
