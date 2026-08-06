import express, { type ErrorRequestHandler } from "express";

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

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    const isBodyParseError =
      error instanceof SyntaxError &&
      "status" in error &&
      error.status === 400 &&
      "body" in error;

    if (isBodyParseError) {
      response
        .status(400)
        .json({ code: "INVALID_JSON", message: "Invalid JSON body" });
      return;
    }

    response
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "Internal server error" });
  };

  app.use(errorHandler);

  return app;
}
