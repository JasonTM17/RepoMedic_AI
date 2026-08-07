import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const host = process.env.HOST ?? "127.0.0.1";

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port number");
}

createApp().listen(port, host, () => {
  process.stdout.write(`RepoMedic API listening on ${host}:${port}\n`);
});
