import { Spinner } from "@kayleai/ui/spinner";
import { useSession } from "./session-provider";

export function SessionLoader() {
  const { session, error } = useSession();

  if (session || error) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-1 grow items-center justify-center">
      <Spinner className="size-9 animate-spin" />
    </div>
  );
}
