import { useAuth } from "@kayle-id/auth/client/provider";
import { Link } from "@tanstack/react-router";

export function Dashboard() {
  const { user, session } = useAuth();

  return (
    <div className="">
      <h1>Dashboard</h1>
      <Link to="/api-keys">— API Keys</Link>
      <pre>{JSON.stringify({ user, session }, null, 2)}</pre>
    </div>
  );
}
