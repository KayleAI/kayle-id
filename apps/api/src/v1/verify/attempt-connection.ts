export const ATTEMPT_CONNECTION_ACTIVE_CODE =
  "ATTEMPT_CONNECTION_ACTIVE" as const;

type AttemptOwnershipResult =
  | {
      ok: true;
      owned: boolean;
    }
  | {
      ok: false;
      code: typeof ATTEMPT_CONNECTION_ACTIVE_CODE;
    };

const activeAttemptOwners = new Map<string, string>();

export function claimAttemptConnection({
  attemptId,
  ownerId,
}: {
  attemptId: string;
  ownerId: string;
}): AttemptOwnershipResult {
  const existingOwner = activeAttemptOwners.get(attemptId);

  if (!existingOwner) {
    activeAttemptOwners.set(attemptId, ownerId);
    return {
      ok: true,
      owned: true,
    };
  }

  if (existingOwner === ownerId) {
    return {
      ok: true,
      owned: false,
    };
  }

  return {
    ok: false,
    code: ATTEMPT_CONNECTION_ACTIVE_CODE,
  };
}

export function releaseAttemptConnection({
  attemptId,
  ownerId,
}: {
  attemptId: string;
  ownerId: string;
}): void {
  const existingOwner = activeAttemptOwners.get(attemptId);
  if (existingOwner === ownerId) {
    activeAttemptOwners.delete(attemptId);
  }
}
