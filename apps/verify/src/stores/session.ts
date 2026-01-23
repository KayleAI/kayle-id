import type {
  AttemptPhase,
  DecryptedMRZData,
  DecryptedNFCData,
  DecryptedSelfieData,
  RelayMessage,
} from "@kayle-id/config/e2ee-types";
import { create } from "zustand";

/**
 * Verification steps for desktop flow.
 * Desktop users go through: explain -> consent -> app-check -> qr-handoff -> waiting -> result -> share -> teardown
 */
export type VerificationStep =
  | "explain"
  | "consent"
  | "app-check"
  | "qr-handoff"
  | "waiting-for-mobile"
  | "result"
  | "share-details"
  | "teardown";

/**
 * Received data status tracking.
 */
type ReceivedDataStatus = {
  mrz: boolean;
  nfc: boolean;
  selfie: boolean;
};

/**
 * Decrypted data from mobile.
 */
type DecryptedData = {
  mrz: DecryptedMRZData | null;
  nfc: DecryptedNFCData | null;
  selfie: DecryptedSelfieData | null;
};

type VerificationStore = {
  // Navigation state
  step: VerificationStep;

  // Session identity
  attemptId: string | null;
  clientPublicKey: string | null;

  // Bootstrap data (for QR code reconstruction)
  bootstrapData: BootstrapResponse | null;

  // Mobile phase tracking (real-time progress from mobile)
  mobilePhase: AttemptPhase | null;
  mobilePhaseError: string | null;

  // Received messages tracking
  receivedMessages: RelayMessage[];
  receivedStatus: ReceivedDataStatus;

  // Decrypted data
  decryptedData: DecryptedData;

  // Verification result
  verificationResult: {
    passed: boolean;
    livenessScore: number;
    matchScore: number;
    codes: string[];
  } | null;

  // Actions - Navigation
  goToExplain: () => void;
  goToConsent: () => void;
  goToAppCheck: () => void;
  goToQRHandoff: () => void;
  goToWaitingForMobile: () => void;
  goToResult: () => void;
  goToShareDetails: () => void;
  goToTeardown: () => void;

  // Actions - Session management
  setAttemptId: (attemptId: string) => void;
  setClientPublicKey: (publicKey: string) => void;
  setBootstrapData: (data: BootstrapResponse) => void;

  // Actions - Phase tracking
  setMobilePhase: (phase: AttemptPhase, error?: string) => void;

  // Actions - Data management
  addReceivedMessage: (message: RelayMessage) => void;
  setDecryptedMRZ: (data: DecryptedMRZData) => void;
  setDecryptedNFC: (data: DecryptedNFCData) => void;
  setDecryptedSelfie: (data: DecryptedSelfieData) => void;
  setVerificationResult: (result: {
    passed: boolean;
    livenessScore: number;
    matchScore: number;
    codes: string[];
  }) => void;

  // Actions - Reset for retry
  resetForRetry: () => void;

  // Computed - Check if all data received
  isAllDataReceived: () => boolean;
};

export const useVerificationStore = create<VerificationStore>((set, get) => ({
  // Initial state
  step: "explain",
  attemptId: null,
  clientPublicKey: null,
  bootstrapData: null,
  mobilePhase: null,
  mobilePhaseError: null,
  receivedMessages: [],
  receivedStatus: {
    mrz: false,
    nfc: false,
    selfie: false,
  },
  decryptedData: {
    mrz: null,
    nfc: null,
    selfie: null,
  },
  verificationResult: null,

  // Navigation actions
  goToExplain: () => set({ step: "explain" }),
  goToConsent: () => set({ step: "consent" }),
  goToAppCheck: () => set({ step: "app-check" }),
  goToQRHandoff: () => set({ step: "qr-handoff" }),
  goToWaitingForMobile: () => set({ step: "waiting-for-mobile" }),
  goToResult: () => set({ step: "result" }),
  goToShareDetails: () => set({ step: "share-details" }),
  goToTeardown: () => set({ step: "teardown" }),

  // Session management
  setAttemptId: (attemptId) => set({ attemptId }),
  setClientPublicKey: (publicKey) => set({ clientPublicKey: publicKey }),
  setBootstrapData: (data) => set({ bootstrapData: data }),

  // Phase tracking
  setMobilePhase: (phase, error) => {
    console.log("[Store] setMobilePhase called:", { phase, error });
    set({
      mobilePhase: phase,
      mobilePhaseError: error ?? null,
    });
  },

  // Data management
  addReceivedMessage: (message) =>
    set((state) => {
      // Don't track phase messages in receivedStatus
      if (message.type === "phase") {
        return {
          receivedMessages: [...state.receivedMessages, message],
        };
      }
      return {
        receivedMessages: [...state.receivedMessages, message],
        receivedStatus: {
          ...state.receivedStatus,
          [message.type]: true,
        },
      };
    }),

  setDecryptedMRZ: (data) =>
    set((state) => ({
      decryptedData: {
        ...state.decryptedData,
        mrz: data,
      },
    })),

  setDecryptedNFC: (data) =>
    set((state) => ({
      decryptedData: {
        ...state.decryptedData,
        nfc: data,
      },
    })),

  setDecryptedSelfie: (data) =>
    set((state) => ({
      decryptedData: {
        ...state.decryptedData,
        selfie: data,
      },
    })),

  setVerificationResult: (result) => set({ verificationResult: result }),

  // Reset for retry
  resetForRetry: () =>
    set({
      attemptId: null,
      clientPublicKey: null,
      bootstrapData: null,
      mobilePhase: null,
      mobilePhaseError: null,
      receivedMessages: [],
      receivedStatus: {
        mrz: false,
        nfc: false,
        selfie: false,
      },
      decryptedData: {
        mrz: null,
        nfc: null,
        selfie: null,
      },
      verificationResult: null,
      step: "explain",
    }),

  // Check if all data received
  isAllDataReceived: () => {
    const status = get().receivedStatus;
    return status.mrz && status.nfc && status.selfie;
  },
}));
