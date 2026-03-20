type WaitUntilExecutionContext = {
  waitUntil: (task: Promise<unknown>) => void;
};

export function waitUntilIfAvailable({
  createTask,
  getExecutionCtx,
}: {
  createTask: () => Promise<unknown>;
  getExecutionCtx: () => WaitUntilExecutionContext;
}): void {
  try {
    getExecutionCtx().waitUntil(createTask());
  } catch {
    // Tests and non-worker runtimes may not provide an ExecutionContext.
  }
}
