import type {
  BetterAuthClientPlugin,
  BetterFetchOption,
} from "better-auth/client";
import type { Session, User } from "better-auth/types";
import type { magic } from ".";

export const magicClient = () =>
  ({
    id: "magic",
    $InferServerPlugin: {} as ReturnType<typeof magic>,
    getActions: ($fetch) => ({
      magic: {
        signIn: async (
          data: {
            email: string;
            type: "sign-in" | "email-verification";
            callbackURL?: string;
            fetchOptions?: BetterFetchOption;
          },
          options = {}
        ): Promise<{ data: { status: boolean }; error: Error | null }> =>
          await $fetch("/magic/sign-in", {
            method: "POST",
            body: data,
            ...options,
            ...(data.fetchOptions ?? {}),
          }),
        verifyLink: async (
          data: {
            token: string;
            callbackURL?: string;
          },
          options = {}
        ) =>
          await $fetch(
            `/magic/verify-link?token=${data.token}&callbackURL=${
              data.callbackURL ?? ""
            }`,
            {
              method: "GET",
              ...options,
            }
          ),
        verifyOTP: async (
          data: {
            email: string;
            otp: string;
            type: "sign-in" | "email-verification";
          },
          options = {}
        ): Promise<{
          data: {
            status: boolean;
            user: User & { termsAccepted: boolean };
            session: Session;
          };
          error: Error | null;
        }> =>
          await $fetch("/magic/verify-otp", {
            method: "POST",
            body: data,
            ...options,
          }),
      },
    }),
    pathMethods: {
      "/magic/sign-in": "POST",
      "/magic/verify-link": "GET",
      "/magic/verify-otp": "POST",
    },
  }) satisfies BetterAuthClientPlugin;
