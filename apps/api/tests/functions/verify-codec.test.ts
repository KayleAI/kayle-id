import { describe, expect, test } from "bun:test";
import {
  decodeClientMessage,
  decodeServerMessage,
  encodeClientData,
  encodeClientHello,
  encodeClientPhase,
  encodeClientShareSelection,
  encodeServerAck,
  encodeServerError,
  encodeServerShareReady,
  encodeServerShareRequest,
  encodeServerVerdict,
} from "@kayle-id/capnp/verify-codec";

describe("verify codec", () => {
  test("round-trips hello payload", () => {
    const bytes = encodeClientHello({
      attemptId: "va_test_123",
      mobileWriteToken: "token_123",
      deviceId: "device_123",
      appVersion: "verify-web",
    });

    const decoded = decodeClientMessage(bytes);
    expect(decoded?.hello?.attemptId).toBe("va_test_123");
    expect(decoded?.hello?.mobileWriteToken).toBe("token_123");
    expect(decoded?.hello?.deviceId).toBe("device_123");
    expect(decoded?.hello?.appVersion).toBe("verify-web");
  });

  test("round-trips phase and data payloads", () => {
    const phaseBytes = encodeClientPhase({
      phase: "ping",
      error: "",
    });
    const decodedPhase = decodeClientMessage(phaseBytes);
    expect(decodedPhase?.phase?.phase).toBe("ping");

    const dataBytes = encodeClientData({
      kind: 3,
      raw: new Uint8Array([1, 2, 3]),
      index: 0,
      total: 1,
      chunkIndex: 0,
      chunkTotal: 1,
    });
    const decodedData = decodeClientMessage(dataBytes);
    expect(decodedData?.data?.kind).toBe(3);
    expect(Array.from(decodedData?.data?.raw ?? [])).toEqual([1, 2, 3]);

    const shareSelectionBytes = encodeClientShareSelection({
      sessionId: "vs_test_123",
      selectedFieldKeys: ["kayle_document_id", "nationality_code"],
    });
    const decodedShareSelection = decodeClientMessage(shareSelectionBytes);
    expect(decodedShareSelection?.shareSelection).toEqual({
      sessionId: "vs_test_123",
      selectedFieldKeys: ["kayle_document_id", "nationality_code"],
    });
  });

  test("round-trips server ack, error, verdict, share request, and share ready payloads", () => {
    const ackBytes = encodeServerAck("hello_ok");
    const decodedAck = decodeServerMessage(ackBytes);
    expect(decodedAck?.ack?.message).toBe("hello_ok");

    const errorBytes = encodeServerError(
      "HELLO_AUTH_REQUIRED",
      "Hello authentication required."
    );
    const decodedError = decodeServerMessage(errorBytes);
    expect(decodedError?.error?.code).toBe("HELLO_AUTH_REQUIRED");
    expect(decodedError?.error?.message).toBe("Hello authentication required.");

    const verdictBytes = encodeServerVerdict({
      outcome: "rejected",
      reasonCode: "selfie_face_mismatch",
      reasonMessage: "Selfie does not match the passport photo.",
      retryAllowed: true,
      remainingAttempts: 2,
    });
    const decodedVerdict = decodeServerMessage(verdictBytes);
    expect(decodedVerdict?.verdict).toEqual({
      outcome: "rejected",
      reasonCode: "selfie_face_mismatch",
      reasonMessage: "Selfie does not match the passport photo.",
      retryAllowed: true,
      remainingAttempts: 2,
    });

    const shareRequestBytes = encodeServerShareRequest({
      contractVersion: 1,
      sessionId: "vs_test_123",
      fields: [
        {
          key: "kayle_document_id",
          reason: 'Sharing "Kayle Document ID"',
          required: true,
        },
        {
          key: "nationality_code",
          reason: "Nationality code is required for this check.",
          required: false,
        },
      ],
    });
    const decodedShareRequest = decodeServerMessage(shareRequestBytes);
    expect(decodedShareRequest?.shareRequest).toEqual({
      contractVersion: 1,
      sessionId: "vs_test_123",
      fields: [
        {
          key: "kayle_document_id",
          reason: 'Sharing "Kayle Document ID"',
          required: true,
        },
        {
          key: "nationality_code",
          reason: "Nationality code is required for this check.",
          required: false,
        },
      ],
    });

    const shareReadyBytes = encodeServerShareReady({
      sessionId: "vs_test_123",
      selectedFieldKeys: [
        "nationality_code",
        "kayle_document_id",
        "kayle_human_id",
      ],
    });
    const decodedShareReady = decodeServerMessage(shareReadyBytes);
    expect(decodedShareReady?.shareReady).toEqual({
      sessionId: "vs_test_123",
      selectedFieldKeys: [
        "nationality_code",
        "kayle_document_id",
        "kayle_human_id",
      ],
    });
  });
});
