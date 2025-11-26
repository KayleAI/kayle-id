import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import type { User } from "better-auth/types";
import { APIError } from "better-call";
import { z } from "zod";

type MagicOptions = {
  expiresIn?: number;
  otpLength?: number;
  sendMagicOtpAuth: (
    data: {
      /**
       * The email to send the magic link to
       */
      email: string;
      /**
       * The URL to send the magic link to
       */
      url: string;
      /**
       * The OTP to send to the user
       */
      otp: string;
      /**
       * The type of magic link to send
       */
      type: "sign-in" | "email-verification";
    },
    request?: Request
  ) => Promise<void> | void;
  disableSignUp?: boolean;
  rateLimit?: {
    window: number;
    max: number;
  };
};

export const magic = (options: MagicOptions): BetterAuthPlugin => {
  const opts = {
    expiresIn: 300,
    otpLength: 6,
    disableSignUp: false,
    ...options,
  };

  return {
    id: "magic",
    endpoints: {
      signIn: createAuthEndpoint(
        "/magic/sign-in",
        {
          method: "POST",
          requireHeaders: true,
          body: z.object({
            email: z.string().email(),
            type: z.enum(["sign-in", "email-verification"]),
            callbackURL: z.string().optional(),
          }),
        },
        async (ctx) => {
          const { email, type, callbackURL } = ctx.body;

          if (opts.disableSignUp) {
            const user =
              await ctx.context.internalAdapter.findUserByEmail(email);

            if (!user) {
              throw new APIError("BAD_REQUEST", {
                message:
                  "We couldn't find a user with that email. Please try again.",
              });
            }
          }

          const token = generateRandomString(32, "a-z", "A-Z");
          const otp = generateRandomString(opts.otpLength, "0-9");

          await ctx.context.internalAdapter.createVerificationValue({
            identifier: `link-${token}`,
            value: JSON.stringify({ email, type }),
            expiresAt: new Date(Date.now() + opts.expiresIn * 1000),
          });

          await ctx.context.internalAdapter.createVerificationValue({
            identifier: `otp-${email}`,
            value: otp,
            expiresAt: new Date(Date.now() + opts.expiresIn * 1000),
          });

          const url = `${ctx.context.baseURL}/magic/verify-link?token=${token}&callbackURL=${
            callbackURL ?? "/"
          }`;

          try {
            await opts.sendMagicOtpAuth({ email, url, otp, type }, ctx.request);
          } catch (e) {
            ctx.context.logger.error("Failed to send magic-otp auth", e);
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "We couldn't send you a magic link. Please try again.",
            });
          }

          return ctx.json({ status: true });
        }
      ),
      verifyLink: createAuthEndpoint(
        "/magic/verify-link",
        {
          method: "GET",
          query: z.object({
            token: z.string(),
            callbackURL: z.string().optional(),
          }),
          requireHeaders: true,
        },
        async (ctx) => {
          const { token, callbackURL } = ctx.query;
          const tokenValue =
            await ctx.context.internalAdapter.findVerificationValue(
              `link-${token}`
            );

          if (!tokenValue || tokenValue.expiresAt < new Date()) {
            throw new APIError("BAD_REQUEST", {
              message: "Your link is invalid or has expired. Please try again.",
            });
          }

          const { email, type } = JSON.parse(tokenValue.value);

          await ctx.context.internalAdapter.deleteVerificationValue(
            tokenValue.id
          );

          const user = await handleUserCreationOrUpdate(
            ctx,
            opts,
            email,
            type as "sign-in" | "email-verification"
          );

          const session = await ctx.context.internalAdapter.createSession(
            user.id
          );
          await setSessionCookie(ctx, { session, user });

          if (callbackURL) {
            throw ctx.redirect(callbackURL);
          }

          return ctx.json({ status: true, user, session });
        }
      ),
      verifyOTP: createAuthEndpoint(
        "/magic/verify-otp",
        {
          method: "POST",
          body: z.object({
            email: z.string().email(),
            otp: z.string(),
            type: z.enum(["sign-in", "email-verification"]),
          }),
          requireHeaders: true,
        },
        async (ctx) => {
          const { email, otp, type } = ctx.body;
          const otpValue =
            await ctx.context.internalAdapter.findVerificationValue(
              `otp-${email}`
            );

          if (
            !otpValue ||
            otpValue.expiresAt < new Date() ||
            otpValue.value !== otp
          ) {
            throw new APIError("BAD_REQUEST", {
              message: "Your OTP is invalid or has expired. Please try again.",
            });
          }

          await ctx.context.internalAdapter.deleteVerificationValue(
            otpValue.id
          );

          const user = await handleUserCreationOrUpdate(ctx, opts, email, type);

          const session = await ctx.context.internalAdapter.createSession(
            user.id
          );

          await setSessionCookie(ctx, { session, user });

          return ctx.json({ status: true, user, session });
        }
      ),
    },
    rateLimit: [
      {
        pathMatcher(path) {
          return (
            path.startsWith("/magic/sign-in") ??
            path.startsWith("/magic/verify-link")
          );
        },
        window: opts.rateLimit?.window ?? 60,
        max: opts.rateLimit?.max ?? 5,
      },
    ],
  };
};

async function handleUserCreationOrUpdate(
  // biome-ignore lint/suspicious/noExplicitAny: this is intentional
  ctx: any,
  opts: MagicOptions,
  email: string,
  type: "sign-in" | "email-verification"
): Promise<User> {
  let user = await ctx.context.internalAdapter.findUserByEmail(email);

  if (!user) {
    if (opts.disableSignUp) {
      throw new APIError("BAD_REQUEST", {
        message: "We couldn't find a user with that email. Please try again.",
      });
    }
    user = await ctx.context.internalAdapter.createUser({
      email,
      // The email is always verified when using magic links or entering the code
      emailVerified: true,
      name: "",
    });
  } else if (type === "email-verification") {
    user = await ctx.context.internalAdapter.updateUser(user.id, {
      emailVerified: true,
    });
  }

  if ("user" in user) {
    return user.user;
  }

  return user;
}
