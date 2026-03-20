import { useAuth } from "@kayle-id/auth/client/provider";
import { PageHeading } from "@/components/page-heading";

export function Homepage() {
  const { status } = useAuth();

  return (
    <main className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <PageHeading
        actions={[
          {
            to: "/demo",
            label: "View Demo",
            variant: "outline",
          },
          {
            to: status === "authenticated" ? "/dashboard" : "/sign-in",
            label: "Get Started",
          },
        ]}
        description="Kayle ID provides the building blocks for building identity verification into your platform securely, privately, and at scale."
        title="Identity Verification Infrastructure for KYC, AML, and more."
      />
    </main>
  );
}
