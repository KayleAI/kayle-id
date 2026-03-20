import { createFileRoute } from "@tanstack/react-router";
import { LegalList, LegalSection } from "@/components/legal-document";
import { PageHeading } from "@/components/page-heading";

const LAST_UPDATED = "March 20, 2026";

export const Route = createFileRoute("/_legal/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-white pt-16">
      <main className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <PageHeading
          description={`Last updated ${LAST_UPDATED}. These Terms of Service apply to both developers who integrate Kayle ID and end-users who complete a Kayle ID verification flow.`}
          title="Terms of Service"
        />

        <section className="mt-24">
          <div className="max-w-3xl space-y-16">
            <LegalSection title="Who These Terms Cover">
              <p>
                These Terms of Service govern your access to and use of Kayle
                ID, including the developer dashboard, APIs, webhook tooling,
                verification URLs, and the Kayle ID mobile application.
              </p>
              <p>
                If you use Kayle ID on behalf of a company or other
                organization, you represent that you have authority to bind that
                organization to these terms. In that case, "you" includes both
                you and that organization.
              </p>
            </LegalSection>

            <LegalSection title="The Service">
              <p>
                Kayle ID provides privacy-first identity verification
                infrastructure. Developers can create verification sessions,
                request specific claims, and receive results through encrypted
                webhooks. End-users can verify identity by completing a guided
                passport NFC and selfie flow.
              </p>
              <p>
                The current version of Kayle ID includes product limits. As of{" "}
                {LAST_UPDATED}, the hosted verification flow is centered on the
                Kayle ID iPhone app, browser completion is not supported, no
                liveness check is included, and device or document support may
                be limited. We may change, improve, suspend, or discontinue
                features at any time.
              </p>
            </LegalSection>

            <LegalSection title="Developer Accounts and Credentials">
              <LegalList
                items={[
                  "You must provide accurate account and organization information and keep it up to date.",
                  "You are responsible for all activity that occurs under your account, organization membership, API keys, webhook signing secrets, and private decryption keys.",
                  "You must store credentials securely, rotate them when appropriate, and promptly disable or replace any credential you believe has been compromised.",
                  "Kayle ID may rely on your organization settings, requested share fields, webhook URLs, and uploaded encryption keys exactly as configured by you.",
                ]}
              />
            </LegalSection>

            <LegalSection title="Verification Users and Consent">
              <p>
                If you are completing a verification session, you agree to
                follow the prompts in the Kayle ID flow and to provide the
                passport, selfies, permissions, and device access needed to
                complete the session.
              </p>
              <LegalList
                items={[
                  "You must have the right to use the passport or other submitted material in the verification flow.",
                  "You must grant the permissions needed for camera and NFC access if you want the flow to succeed.",
                  "You may stop a verification session at any time, but the relying party may treat the session as incomplete, failed, expired, or cancelled.",
                  "Optional claims can be declined, but required claims in the session contract cannot be deselected.",
                ]}
              />
            </LegalSection>

            <LegalSection title="Integrator Responsibilities">
              <p>
                If you integrate Kayle ID into your product, you remain
                responsible for your own onboarding, trust, fraud, compliance,
                and user-notice obligations.
              </p>
              <LegalList
                items={[
                  "You must provide any notices, disclosures, consents, and lawful bases required before sending an end-user into a Kayle ID verification flow.",
                  "You should request only the claims you reasonably need for your product or compliance use case.",
                  "You are responsible for verifying webhook signatures, decrypting webhook payloads, securing your endpoint, and protecting the data you receive from Kayle ID.",
                  "You are responsible for the decisions you make based on Kayle ID results, including any fraud, eligibility, onboarding, or access decisions.",
                  "You must comply with all laws and regulations that apply to your use of identity, document, biometric, and verification data.",
                ]}
              />
            </LegalSection>

            <LegalSection title="Acceptable Use">
              <LegalList
                items={[
                  "Do not use Kayle ID for unlawful, deceptive, discriminatory, abusive, or privacy-invasive purposes.",
                  "Do not attempt to bypass security controls, authentication checks, rate limits, or account restrictions.",
                  "Do not probe, reverse engineer, disrupt, or overload the hosted service except to the extent allowed by applicable law and our open-source license.",
                  "Do not submit malware, corrupted payloads, false verification evidence, or data you are not authorized to process.",
                ]}
              />
            </LegalSection>

            <LegalSection title="Open Source and Intellectual Property">
              <p>
                This repository is published under the Apache License 2.0. That
                license applies to the code made available in the repository.
              </p>
              <p>
                Except as expressly granted by that license or by applicable
                law, Kayle Inc. and its licensors retain all rights in the
                hosted service, documentation, trademarks, trade names, logos,
                and other proprietary materials associated with Kayle ID.
              </p>
            </LegalSection>

            <LegalSection title="Privacy and Data Handling">
              <p>
                Your use of Kayle ID is also governed by our Privacy Policy. If
                you are a developer, you are responsible for your own privacy
                notice and data handling practices with respect to your
                end-users.
              </p>
              <p>
                Kayle ID is designed to minimize long-term retention of raw
                verification artifacts, but we do retain developer account
                records, verification metadata, events, and encrypted webhook
                delivery records as described in the Privacy Policy.
              </p>
            </LegalSection>

            <LegalSection title="Availability, Suspension, and Changes">
              <p>
                We do not guarantee that Kayle ID will be available at all
                times, free from interruption, or compatible with every device,
                passport, jurisdiction, or integration pattern.
              </p>
              <p>
                We may suspend or restrict access if we reasonably believe that
                your use creates a security risk, violates these terms, violates
                the law, or threatens the service or its users.
              </p>
              <p>
                We may update these terms by posting a revised version on this
                site. Your continued use of Kayle ID after the updated terms
                take effect means you accept the revised terms.
              </p>
            </LegalSection>

            <LegalSection title="Disclaimers">
              <LegalList
                items={[
                  'Kayle ID is provided "as is" and "as available" to the fullest extent permitted by law.',
                  "A verification result is a signal derived from the submitted passport data, chip data, and selfies. It is not a guarantee of identity, legality, eligibility, or absence of fraud.",
                  "Kayle ID does not provide legal, regulatory, or compliance advice, and you should not treat the service as a substitute for your own risk or legal judgment.",
                  "We disclaim all implied warranties, including implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement, to the fullest extent permitted by law.",
                ]}
              />
            </LegalSection>

            <LegalSection title="Limitation of Liability">
              <p>
                To the fullest extent permitted by law, Kayle Inc. and its
                affiliates, officers, employees, and licensors will not be
                liable for any indirect, incidental, special, consequential,
                exemplary, or punitive damages, or for any loss of profits,
                revenues, data, goodwill, or business opportunities arising out
                of or related to Kayle ID.
              </p>
              <p>
                Where the law does not allow the exclusion of certain damages or
                liabilities, the above limitations apply only to the maximum
                extent permitted by law.
              </p>
            </LegalSection>

            <LegalSection title="Termination">
              <p>
                You may stop using Kayle ID at any time. We may terminate or
                suspend your access at any time if you breach these terms, if we
                are required to do so by law, or if continued access would
                create unacceptable risk for Kayle ID or others.
              </p>
              <p>
                Provisions that by their nature should survive termination,
                including provisions about intellectual property, privacy,
                disclaimers, limitation of liability, and prior misuse, will
                survive.
              </p>
            </LegalSection>

            <LegalSection title="Contact">
              <p>
                Questions about these terms can be sent to{" "}
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
