/** @jsxImportSource react */
import {
  Body,
  Button,
  Column,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export type MagicLinkEmailType = "sign-in" | "email-verification";

export type MagicLinkEmailProps = {
  expiresInMinutes: number;
  otp: string;
  url: string;
};

const plainLinkStyle = {
  color: "#a3a3a3",
  textDecoration: "none",
} as const;

export function MagicLinkEmail({
  expiresInMinutes,
  otp,
  url,
}: MagicLinkEmailProps) {
  return (
    <Html>
      <Head>
        <title>Sign in to Kayle ID</title>
        <Font fallbackFontFamily="Arial" fontFamily="Inter" />
      </Head>
      <Preview>Your Kayle ID sign-in code: {otp}</Preview>
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto my-8 max-w-[500px] bg-neutral-100">
            {/* Header with Logo */}
            <Section className="px-8 pt-8 pb-8">
              <Row>
                <Column
                  align="left"
                  style={{ verticalAlign: "middle" }}
                  width="32"
                >
                  <a href="https://kayle.id" style={{ textDecoration: "none" }}>
                    <Img
                      alt="Kayle"
                      height="32"
                      src="https://kayle.id/apple-touch-icon.png"
                      width="32"
                    />
                  </a>
                </Column>
                <Column align="right" style={{ verticalAlign: "middle" }}>
                  <a href="https://kayle.id" style={{ textDecoration: "none" }}>
                    <Text className="m-0 text-right font-medium text-lg text-neutral-950">
                      Kayle Inc.
                    </Text>
                  </a>
                </Column>
              </Row>
            </Section>

            {/* Main Content */}
            <Section className="max-w-sm px-8 text-center">
              <Heading className="mb-2 text-center font-medium text-lg text-neutral-950">
                Your confirmation code
              </Heading>

              {/* Large OTP Code */}
              <Text className="py-4 text-center font-medium text-4xl text-neutral-950 tracking-tight">
                {otp}
              </Text>

              <Text className="mb-6 text-center text-neutral-700 text-sm leading-relaxed">
                Click the button below, or copy the code above and paste it into
                the sign-in form. This code will expire in {expiresInMinutes}{" "}
                minutes.
              </Text>

              <Text className="mb-8 text-center text-neutral-700 text-sm">
                If you did not try to sign-in or create an account, you can
                safely ignore this message.
              </Text>

              {/* Sign in Button */}
              <Section className="mb-8 text-center">
                <Button
                  className="rounded-full bg-neutral-200 px-12 py-3 font-medium text-neutral-950 text-sm"
                  href={url}
                >
                  Sign in to Kayle ID
                </Button>
              </Section>
            </Section>

            <Hr className="mx-auto my-0 max-w-xs border-neutral-200" />

            {/* Footer */}
            <Section className="border-neutral-200 border-t px-8 pb-8 text-center">
              <Text className="mt-6 mb-4 text-neutral-400 text-xs">
                Sent by Kayle ID
              </Text>
              <Text className="mx-auto mb-4 max-w-sm text-center text-neutral-500 text-xs leading-relaxed">
                You're receiving this email because a secure sign-in or
                verification request was made for this email address. If this
                wasn't you, no action is required and the link and code will
                expire automatically.
              </Text>
              <Text className="mx-auto max-w-xs text-neutral-400 text-xs">
                <a href="https://kayle.id/privacy" style={plainLinkStyle}>
                  Privacy Policy
                </a>
                &nbsp; &nbsp; &nbsp;
                <a href="https://kayle.id/terms" style={plainLinkStyle}>
                  Terms of Service
                </a>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default function PreviewMagicLinkEmail() {
  return (
    <MagicLinkEmail
      expiresInMinutes={15}
      otp="123456"
      url="https://kayle.id/api/auth/magic/verify-link?token=preview-token"
    />
  );
}
