import { AppHeading } from "@/components/app-heading";

export function Dashboard() {
  return (
    <div className="mx-auto flex h-full max-w-7xl flex-1 grow flex-col">
      <AppHeading
        description="Primitives for Identity Infrastructure"
        title="Kayle ID"
      />
      <hr className="my-8" />
    </div>
  );
}
