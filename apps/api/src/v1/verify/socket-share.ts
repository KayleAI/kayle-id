import {
  attemptWebhookDelivery,
  createWebhookDeliveriesForVerificationSucceeded,
} from "@/v1/webhooks/deliveries/service";
import { resolveVerifyErrorMessage } from "./error-response";
import { markAttemptSucceeded } from "./outcome";
import { validateAndBuildShareManifest } from "./share-manifest";
import type { VerifySocketContext } from "./socket-context";

type ShareSelectionPayload = {
  selectedFieldKeys?: string[];
  sessionId?: string;
};

export async function handleShareSelectionMessage(
  context: VerifySocketContext,
  payload: ShareSelectionPayload
): Promise<void> {
  const { session, state, transport } = context;

  transport.logDebug("recv_share_selection", {
    selectedFieldCount: payload.selectedFieldKeys?.length ?? 0,
    sessionIdPresent: Boolean(payload.sessionId),
  });

  if (!(state.helloReceived && state.attemptId && state.shareRequestSent)) {
    transport.sendError(
      "PHASE_OUT_OF_ORDER",
      resolveVerifyErrorMessage("PHASE_OUT_OF_ORDER")
    );
    return;
  }

  const { dg1, dg2 } = state.transfer;
  if (!(dg1 && dg2)) {
    transport.sendError(
      "PHASE_OUT_OF_ORDER",
      resolveVerifyErrorMessage("PHASE_OUT_OF_ORDER")
    );
    return;
  }

  if (state.shareManifest) {
    transport.sendShareReady({
      sessionId: state.shareManifest.sessionId,
      selectedFieldKeys: state.shareManifest.selectedFieldKeys,
    });
    return;
  }

  const result = await validateAndBuildShareManifest({
    contractVersion: session.contractVersion,
    dg1,
    dg2,
    organizationId: session.organizationId,
    selectedFieldKeysInput: payload.selectedFieldKeys,
    sessionId: session.id,
    submittedSessionId: payload.sessionId,
    shareFieldsInput: session.shareFields,
  });

  if (!result.ok) {
    transport.sendError(result.code, result.message);
    return;
  }

  if (typeof state.acceptedFaceScore !== "number") {
    throw new Error("face_score_required_for_share_success");
  }

  const successResult = await markAttemptSucceeded({
    session,
    attemptId: state.attemptId,
    faceScore: state.acceptedFaceScore,
  });

  state.shareManifest = result.manifest;
  const deliveryIds = await createWebhookDeliveriesForVerificationSucceeded({
    attemptId: state.attemptId,
    environment: session.environment,
    eventId: successResult.attemptSucceededEventId,
    manifest: result.manifest,
    organizationId: session.organizationId,
  });

  transport.sendShareReady(result.shareReady);
  context.log.set({
    event: "verify.ws.completed",
    selected_field_count: result.manifest.selectedFieldKeys.length,
    webhook_delivery_count: deliveryIds.length,
  });

  context.scheduleTask(
    (async () => {
      for (const deliveryId of deliveryIds) {
        await attemptWebhookDelivery({
          authSecret: context.env.AUTH_SECRET,
          deliveryId,
        });
      }
    })()
  );
}
