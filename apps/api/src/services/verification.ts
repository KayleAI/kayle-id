/**
 * Verification service for liveness detection and face matching.
 *
 * This is a stubbed implementation that returns mock results.
 * Replace with actual ML service integration when ready.
 */

/**
 * Liveness check result.
 */
export type LivenessResult = {
  /** Whether liveness check passed */
  passed: boolean;
  /** Confidence score (0-1) */
  score: number;
  /** Reason codes for failure */
  codes: string[];
};

/**
 * Face match result.
 */
export type FaceMatchResult = {
  /** Whether face match passed */
  passed: boolean;
  /** Similarity score (0-1) */
  score: number;
  /** Reason codes for failure */
  codes: string[];
};

/**
 * Combined verification result.
 */
export type VerificationResult = {
  /** Overall pass/fail */
  passed: boolean;
  /** Liveness check score */
  livenessScore: number;
  /** Face match score */
  matchScore: number;
  /** Combined reason codes */
  codes: string[];
};

/**
 * Verification service interface.
 */
export type VerificationService = {
  /**
   * Check if a selfie image passes liveness detection.
   *
   * @param selfieImage - Base64-encoded selfie image
   * @returns Liveness check result
   */
  checkLiveness(selfieImage: string): Promise<LivenessResult>;

  /**
   * Compare a document photo (DG2) with a selfie for face matching.
   *
   * @param documentPhoto - Base64-encoded document photo (from DG2)
   * @param selfieImage - Base64-encoded selfie image
   * @returns Face match result
   */
  matchFace(
    documentPhoto: string,
    selfieImage: string
  ): Promise<FaceMatchResult>;

  /**
   * Perform full verification (liveness + face match).
   *
   * @param documentPhoto - Base64-encoded document photo (from DG2)
   * @param selfieImage - Base64-encoded selfie image
   * @returns Combined verification result
   */
  verify(
    documentPhoto: string,
    selfieImage: string
  ): Promise<VerificationResult>;
};

/**
 * Stubbed verification service implementation.
 *
 * Returns mock successful results for testing.
 * Replace with real implementation for production.
 */
export class StubbedVerificationService implements VerificationService {
  /**
   * Simulated processing delay in milliseconds.
   */
  private readonly simulatedDelay: number;

  /**
   * Whether to randomly fail some checks (for testing).
   */
  private readonly randomFailures: boolean;

  constructor(options?: { simulatedDelay?: number; randomFailures?: boolean }) {
    this.simulatedDelay = options?.simulatedDelay ?? 500;
    this.randomFailures = options?.randomFailures ?? false;
  }

  async checkLiveness(selfieImage: string): Promise<LivenessResult> {
    // Simulate processing time
    await this.delay();

    // Basic validation
    if (!selfieImage || selfieImage.length < 100) {
      return {
        passed: false,
        score: 0,
        codes: ["invalid_image"],
      };
    }

    // Random failure for testing
    if (this.randomFailures && Math.random() < 0.1) {
      return {
        passed: false,
        score: 0.3 + Math.random() * 0.2,
        codes: ["spoofing_detected"],
      };
    }

    // Mock successful result
    return {
      passed: true,
      score: 0.95 + Math.random() * 0.05,
      codes: [],
    };
  }

  async matchFace(
    documentPhoto: string,
    selfieImage: string
  ): Promise<FaceMatchResult> {
    // Simulate processing time
    await this.delay();

    // Basic validation
    if (!documentPhoto || documentPhoto.length < 100) {
      return {
        passed: false,
        score: 0,
        codes: ["invalid_document_photo"],
      };
    }

    if (!selfieImage || selfieImage.length < 100) {
      return {
        passed: false,
        score: 0,
        codes: ["invalid_selfie"],
      };
    }

    // Random failure for testing
    if (this.randomFailures && Math.random() < 0.1) {
      return {
        passed: false,
        score: 0.4 + Math.random() * 0.2,
        codes: ["faces_do_not_match"],
      };
    }

    // Mock successful result
    return {
      passed: true,
      score: 0.92 + Math.random() * 0.08,
      codes: [],
    };
  }

  async verify(
    documentPhoto: string,
    selfieImage: string
  ): Promise<VerificationResult> {
    // Run both checks in parallel
    const [livenessResult, matchResult] = await Promise.all([
      this.checkLiveness(selfieImage),
      this.matchFace(documentPhoto, selfieImage),
    ]);

    const passed = livenessResult.passed && matchResult.passed;
    const codes = [...livenessResult.codes, ...matchResult.codes];

    return {
      passed,
      livenessScore: livenessResult.score,
      matchScore: matchResult.score,
      codes,
    };
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.simulatedDelay));
  }
}

/**
 * Default verification service instance.
 */
export const verificationService = new StubbedVerificationService();
