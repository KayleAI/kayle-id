import { create } from "zustand";

export type VerificationStep =
  | "explain"
  | "consent"
  | "passport-capture"
  | "nfc-capture"
  | "selfie-capture"
  | "result"
  | "share-details"
  | "teardown";

type VerificationStore = {
  step: VerificationStep;
  goToExplain: () => void;
  goToConsent: () => void;
  goToPassportCapture: () => void;
  goToNfcCapture: () => void;
  goToSelfieCapture: () => void;
  goToResult: () => void;
  goToShareDetails: () => void;
  goToTeardown: () => void;
};

export const useVerificationStore = create<VerificationStore>((set) => ({
  step: "explain",
  /**
   * Explain the verification process.
   */
  goToExplain: () => set({ step: "explain" }),
  /**
   * Get the user's consent to complete the verification.
   */
  goToConsent: () => set({ step: "consent" }),
  /**
   * Capture the passport's photo page.
   */
  goToPassportCapture: () => set({ step: "passport-capture" }),
  /**
   * Capture the passport's NFC data.
   */
  goToNfcCapture: () => set({ step: "nfc-capture" }),
  /**
   * Capture a selfie of the user.
   */
  goToSelfieCapture: () => set({ step: "selfie-capture" }),
  /**
   * Show the result of the verification.
   */
  goToResult: () => set({ step: "result" }),
  /**
   * Share details with the platform.
   */
  goToShareDetails: () => set({ step: "share-details" }),
  /**
   * Teardown the verification session.
   */
  goToTeardown: () => set({ step: "teardown" }),
}));
