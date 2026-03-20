import { createElement } from "react";
import { Resend } from "resend";
import { MagicLinkEmail, type MagicLinkEmailType } from "../emails/magic-link";

export type ResendEmailClient = Pick<Resend, "emails">;

export type SendMagicLinkEmailInput = {
  apiKey?: string;
  expiresInMinutes?: number;
  from: string;
  otp: string;
  resend?: ResendEmailClient;
  to: string;
  type: MagicLinkEmailType;
  url: string;
};

function getResendClient({
  apiKey,
  resend,
}: Pick<SendMagicLinkEmailInput, "apiKey" | "resend">): ResendEmailClient {
  if (resend) {
    return resend;
  }

  if (!apiKey) {
    throw new Error("Missing Resend client or API key for magic link email.");
  }

  return new Resend(apiKey);
}

export async function sendMagicLinkEmail({
  apiKey,
  expiresInMinutes = 15,
  from,
  otp,
  resend,
  to,
  url,
}: SendMagicLinkEmailInput): Promise<void> {
  const emailProps = {
    expiresInMinutes,
    otp,
    url,
  };
  const client = getResendClient({ apiKey, resend });
  const { error } = await client.emails.send({
    from,
    react: createElement(MagicLinkEmail, emailProps),
    subject: "Kayle ID — Sign in to your account",
    to,
    /*headers: {
      "X-Entity-Ref-ID": crypto.randomUUID(),
    },*/
  });

  if (error) {
    throw new Error(
      `Failed to send magic link email: ${error.message ?? "Unknown Resend error"}`
    );
  }
}
