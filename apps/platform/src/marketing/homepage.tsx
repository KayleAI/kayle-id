import { Link } from "@tanstack/react-router";

export function Homepage() {
  return (
    <div className="">
      <h1>Kayle ID</h1>
      <Link to="/sign-in">Sign in</Link>
    </div>
  );
}
