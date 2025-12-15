import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Homepage });

function Homepage() {
  return (
    <div className="">
      <h1>Kayle ID</h1>
    </div>
  );
}
