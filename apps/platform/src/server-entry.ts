import server from "@tanstack/react-start/server-entry";
import { DemoRunMailbox as WorkerDemoRunMailbox } from "@/demo/run-mailbox";

export const DemoRunMailbox = WorkerDemoRunMailbox;

export default {
  fetch: server.fetch,
};
