import { useAuth } from "@kayle-id/auth/client/provider";
import { Link } from "@tanstack/react-router";

export function Dashboard() {
  const { user, session, activeOrganization, organizations } = useAuth();

  return (
    <div className="">
      <h1>Dashboard</h1>
      <Link to="/api-keys">— API Keys</Link>
      <pre>
        {JSON.stringify(
          { user, session, activeOrganization, organizations },
          null,
          2
        )}
      </pre>
    </div>
  );
}
