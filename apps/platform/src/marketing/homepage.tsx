import { useAuth } from "@kayle-id/auth/client/provider";
import { Button } from "@kayleai/ui/button";
import { Link } from "@tanstack/react-router";
import { PageHeading } from "@/components/page-heading";

const steps = [
  {
    index: "01",
    title: "Launch a session",
    description:
      "Configure the fields you want and send your user into a single guided flow.",
  },
  {
    index: "02",
    title: "Verify your user's identity",
    description:
      "We guide the user through the steps to verify their identity.",
  },
  {
    index: "03",
    title: "Continue with the approved data",
    description: "Users choose the data they want to securely share with you.",
  },
] as const;

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
        description="Kayle ID gives teams a privacy-first way to verify identity with passport NFC, selfie capture, and selective disclosure built into one coherent flow."
        title="Identity verification infrastructure for high-trust products."
      />

      <section className="mt-24 border-neutral-100 border-t pt-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div>
            <p className="text-emerald-600 text-sm uppercase tracking-widest">
              Flow
            </p>
            <h2 className="mt-4 text-balance font-light text-3xl text-neutral-950 tracking-tight">
              Built for products that need a verification answer without a
              sprawling integration.
            </h2>
          </div>
          <ol className="space-y-8">
            {steps.map((step) => (
              <li
                className="grid gap-4 border-neutral-100 border-b pb-8 md:grid-cols-[4rem_minmax(0,1fr)]"
                key={step.index}
              >
                <span className="font-mono text-emerald-600 text-lg leading-relaxed">
                  {step.index}
                </span>
                <div>
                  <h3 className="mb-2 font-light text-neutral-950 text-xl">
                    {step.title}
                  </h3>
                  <p className="max-w-2xl text-neutral-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-24 border-neutral-100 border-t pt-24">
        <div className="max-w-3xl">
          <h2 className="text-balance font-light text-3xl text-neutral-950 tracking-tight">
            Bring Kayle&apos;s calmer, more legible design language into your
            identity flows.
          </h2>
          <p className="mt-4 text-balance text-lg text-neutral-600">
            Explore the live demo, then connect Kayle ID to your own onboarding
            or compliance journey.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Button
              nativeButton={false}
              render={<Link to="/demo">View Demo</Link>}
              variant="outline"
            />
            <Button
              nativeButton={false}
              render={
                <Link
                  to={status === "authenticated" ? "/dashboard" : "/sign-in"}
                >
                  Get Started
                </Link>
              }
            />
          </div>
        </div>
      </section>
    </main>
  );
}
