import { createFileRoute } from "@tanstack/react-router";
import { LegalList, LegalSection } from "@/components/legal-document";
import { PageHeading } from "@/components/page-heading";

const LAST_UPDATED = "March 20, 2026";

export const Route = createFileRoute("/_legal/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white pt-16">
      <main className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <PageHeading
          description={`Last updated ${LAST_UPDATED}.\n\nThis Privacy Policy applies to developers who integrate Kayle ID and people who use Kayle ID to verify their identity.`}
          title="Privacy Policy"
        />

        <section className="mt-24">
          <div className="max-w-3xl space-y-16">
            <LegalSection title="Scope">
              <p>
                Kayle ID is identity verification infrastructure operated by
                Kayle Inc. This policy applies when you use the Kayle ID
                dashboard, API, webhook tooling, verification flows, or the
                Kayle ID mobile application.
              </p>
              <p>
                We serve two main groups of people: developers and teams who
                integrate Kayle ID into their products, and end-users who are
                asked by those products to complete a verification session.
              </p>
              <p>
                If another platform sends you to Kayle ID for verification, that
                platform also has its own privacy practices. In particular, that
                platform decides which claims it requests from you and what it
                does with the verification result it receives from Kayle ID.
              </p>
            </LegalSection>

            <LegalSection title="Information We Collect">
              <div className="space-y-3">
                <h3 className="font-medium text-base text-neutral-900">
                  Developer and organization data
                </h3>
                <LegalList
                  items={[
                    "Account details such as name, email address, and profile image when provided through sign-in.",
                    "Organization records such as organization name, slug, logo, membership, invitations, and role information.",
                    "Authentication and session records, including secure cookies, sign-in verification records, IP address, and user agent associated with developer sessions.",
                    "Integration configuration such as API key names, permissions, metadata, webhook endpoint URLs, webhook signing secrets, and public encryption keys.",
                  ]}
                />
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-base text-neutral-900">
                  Verification data
                </h3>
                <LegalList
                  items={[
                    "Verification session data such as session ID, requested share fields, human-readable sharing reasons, redirect URL, timestamps, and terminal status.",
                    "Verification attempt data such as attempt ID, lifecycle phase, app version, hashed handoff token material, hashed device identifier, failure code, completion timestamp, and risk score.",
                    "Raw verification inputs processed during an active session, including the passport MRZ scan used to unlock the chip, passport NFC data groups needed for verification, the passport chip portrait, and captured selfie images.",
                    "User sharing choices, including which optional claims the user selected and which required claims were mandated by the requesting platform.",
                  ]}
                />
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-base text-neutral-900">
                  Technical and operational data
                </h3>
                <LegalList
                  items={[
                    "Request, delivery, and event metadata such as request ID, sanitized path, webhook delivery attempts, status codes, and retry scheduling information.",
                    "Security and integrity data such as hashed API keys, hashed mobile write tokens, encrypted webhook payloads, encrypted signing secrets, and audit-style event records.",
                  ]}
                />
              </div>

              <p>
                We do not create a separate consumer account for end-users who
                only complete a verification session unless they separately
                register as developers.
              </p>
            </LegalSection>

            <LegalSection title="How We Use Information">
              <LegalList
                items={[
                  "To authenticate developers, manage organizations, and secure access to the dashboard and API.",
                  "To create verification sessions, build share contracts, and present the end-user with the claims requested by the relying party.",
                  "To validate passport authenticity by checking chip data, including DG1, DG2, and SOD artifacts.",
                  "To compare the passport chip portrait against captured selfies using Kayle ID's internal face-matching service.",
                  "To generate verification status records, events, risk scores, and receiver-scoped identifiers such as the Kayle Document ID.",
                  "To deliver the verification result and user-selected claims to the relying party through encrypted webhook payloads.",
                  "To monitor service health, investigate abuse or failures, enforce our terms, and comply with legal obligations.",
                ]}
              />
            </LegalSection>

            <LegalSection title="How Verification Data Moves Through Kayle ID">
              <p>
                A developer creates a verification session through the Kayle ID
                API and defines which claims may be requested. The user is then
                sent to a Kayle ID verification URL, which currently hands the
                session off into the Kayle ID iPhone app.
              </p>
              <p>
                During the active session, Kayle ID asks the user to consent,
                scans the passport photo page to prepare NFC access, reads the
                passport chip, and captures multiple selfies. Those artifacts
                are used to confirm document authenticity and compare the
                document portrait against the submitted selfies.
              </p>
              <p>
                After verification succeeds, Kayle ID asks the user which
                optional claims to share. The selected claims are packaged into
                a webhook payload that is encrypted to the developer's public
                key and signed with the webhook signing secret. Kayle ID stores
                that payload only in encrypted form for delivery and retry
                purposes.
              </p>
            </LegalSection>

            <LegalSection title="What We Store and What We Do Not Store">
              <div className="space-y-3">
                <h3 className="font-medium text-base text-neutral-900">
                  We store
                </h3>
                <LegalList
                  items={[
                    "Developer account, organization, API key, webhook, and authentication records.",
                    "Verification session and attempt metadata, including status, lifecycle phase, timestamps, app version, failure codes, and risk scores.",
                    "Events and webhook delivery records, including encrypted webhook payloads and delivery attempt history.",
                    "Hashed API keys, hashed mobile write tokens, and hashed device identifiers used to protect live session authentication.",
                  ]}
                />
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-base text-neutral-900">
                  We do not persist in the primary application database
                </h3>
                <LegalList
                  items={[
                    "Plaintext API keys after initial creation.",
                    "Plaintext mobile write tokens after issuance.",
                    "The raw MRZ scan used only to unlock passport NFC access.",
                    "Raw passport NFC artifacts and raw selfie image artifacts as ordinary database records.",
                  ]}
                />
              </div>

              <p>
                Raw verification artifacts are processed in volatile session
                state while the verification is active. If a developer requests
                the <code>document_photo</code> claim and the user shares it,
                the resulting document portrait is included in the encrypted
                webhook payload delivered to that developer.
              </p>
            </LegalSection>

            <LegalSection title="How We Share Information">
              <LegalList
                items={[
                  "With the relying party that requested the verification, but only for the verification result and claims included in the session contract and selected by the user, except where a claim is marked required.",
                  "With infrastructure and security providers that help us operate Kayle ID, such as hosted compute, storage, networking, database, and authentication providers.",
                  "With Google if a developer chooses Google sign-in for their Kayle ID account.",
                  "When required by law, legal process, or to protect the rights, safety, and security of Kayle ID, our users, or third parties.",
                  "As part of a merger, financing, acquisition, or other corporate transaction, subject to appropriate confidentiality and legal safeguards.",
                ]}
              />
            </LegalSection>

            <LegalSection title="Security">
              <p>
                We use technical and organizational measures designed to protect
                the data we handle. These include TLS in transit, secure and
                HTTP-only authentication cookies, hashed API keys, hashed
                handoff credentials, encrypted webhook signing secrets, and
                end-to-end encryption of webhook payloads to the developer's
                public key.
              </p>
              <p>
                We also restrict access to developer resources through
                organization membership controls and keep structured operational
                logs focused on service safety and troubleshooting rather than
                raw identity payloads.
              </p>
            </LegalSection>

            <LegalSection title="Retention">
              <LegalList
                items={[
                  "Verification sessions currently expire 60 minutes after creation unless they are completed or cancelled earlier.",
                  "Mobile handoff tokens currently expire five minutes after issuance.",
                  "Magic-link and OTP sign-in verification records currently expire after 15 minutes.",
                  "Raw verification artifacts are processed transiently and cleared from the live transfer state when the verification socket closes.",
                  "Developer account records, session metadata, events, and encrypted webhook delivery records may be retained for operational, security, support, audit, fraud-prevention, and legal-compliance purposes.",
                ]}
              />
            </LegalSection>

            <LegalSection title="Your Choices and Rights">
              <p>
                Developers can manage organization membership, rotate or delete
                API keys, configure webhook endpoints and encryption keys, and
                stop creating new verification sessions at any time.
              </p>
              <p>
                End-users can choose whether to continue with a verification
                session and can decide which optional claims to share. Required
                claims cannot be deselected because they are part of the
                developer's session contract.
              </p>
              <p>
                Depending on where you live, you may have rights to request
                access, correction, deletion, or restriction of personal data.
                To make a request, email{" "}
                <a
                  className="underline decoration-dashed underline-offset-2"
                  href="mailto:help@kayle.id"
                >
                  help@kayle.id
                </a>
                . If your request concerns data that a relying party requested
                or received, we may direct you to that party because it controls
                how it uses the verification result on its side.
              </p>
            </LegalSection>

            <LegalSection title="Changes and Contact">
              <p>
                We may update this Privacy Policy from time to time to reflect
                changes to the service, security practices, or legal
                requirements. When we make material changes, we will post the
                updated version here and update the "Last updated" date above.
              </p>
              <p>
                Questions about this Privacy Policy can be sent to{" "}
                <a
                  className="underline decoration-dashed underline-offset-2"
                  href="mailto:help@kayle.id"
                >
                  help@kayle.id
                </a>
                .
              </p>
            </LegalSection>
          </div>
        </section>
      </main>
    </div>
  );
}
