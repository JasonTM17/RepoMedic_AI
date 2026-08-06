export interface Task {
  id: number;
  title: string;
  completed: boolean;
}

let nextId = 0;
let tasks: Task[] = [];

export function createTask(title: string): Task {
  const task: Task = { id: nextId, title, completed: false };
  nextId++;
  tasks.push(task);
  return task;
}

export function getTask(id: number): Task | undefined {
  return tasks[id];
}

export function getAllTasks(): Task[] {
  return tasks;
}

export function completeTask(id: number): Task | undefined {
  const task = getTask(id);
  if (task) {
    task.completed = true;
  }
  return task;
}

export function clearTasks(): void {
  nextId = 0;
  tasks = [];
}
