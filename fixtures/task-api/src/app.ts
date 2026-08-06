import express, { type ErrorRequestHandler } from "express";
import {
  createTask,
  getAllTasks,
  getTask,
  completeTask,
} from "./task-store.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.post("/tasks", (req, res) => {
    const task = createTask(req.body.title);
    res.status(200).json(task);
  });

  app.get("/tasks", (req, res) => {
    res.json(getAllTasks());
  });

  app.get("/tasks/:id", (req, res) => {
    const task = getTask(parseInt(req.params.id, 10));
    if (!task) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(task);
  });

  app.patch("/tasks/:id/complete", (req, res) => {
    const task = completeTask(parseInt(req.params.id, 10));
    if (!task) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(task);
  });

  const errorHandler: ErrorRequestHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}
