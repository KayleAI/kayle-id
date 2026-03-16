import { Container } from "@cloudflare/containers";
import type { ContainerFetcher } from "./worker";
import {
  createFaceMatcherWorker,
  FACE_MATCHER_DETECTOR_PATH,
  FACE_MATCHER_MODEL_PATH,
} from "./worker";

const FACE_MATCHER_CONTAINER_COUNT = 2;
const CONTAINER_HEALTH_ATTEMPTS = 3;
const CONTAINER_HEALTH_RETRY_DELAY_MS = 250;
const FACE_MATCHER_CONTAINER_NAME_PREFIX = "face-matcher";

function resolveContainerBinding(
  env: unknown
): DurableObjectNamespace<FaceMatcherContainer> | null {
  if (!(env && typeof env === "object")) {
    return null;
  }

  const candidate = Reflect.get(env, "FACE_MATCHER_CONTAINER");

  return candidate
    ? (candidate as DurableObjectNamespace<FaceMatcherContainer>)
    : null;
}

function createContainerFetchers(
  binding: DurableObjectNamespace<FaceMatcherContainer>
): ContainerFetcher[] {
  return Array.from(
    { length: FACE_MATCHER_CONTAINER_COUNT },
    (_, index) =>
      binding.get(
        binding.idFromName(`${FACE_MATCHER_CONTAINER_NAME_PREFIX}-${index}`)
      ) as unknown as ContainerFetcher
  );
}

async function isContainerHealthy(
  container: ContainerFetcher
): Promise<boolean> {
  try {
    const response = await container.fetch("http://container/health");

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: { ready?: boolean };
    } | null;

    return payload?.data?.ready === true;
  } catch {
    return false;
  }
}

async function findHealthyContainer(
  containers: ContainerFetcher[]
): Promise<ContainerFetcher | null> {
  for (const container of containers) {
    if (await isContainerHealthy(container)) {
      return container;
    }
  }

  return null;
}

async function getContainerInstance(
  env: unknown
): Promise<ContainerFetcher | null> {
  const binding = resolveContainerBinding(env);

  if (!binding) {
    return null;
  }

  const containers = createContainerFetchers(binding);

  for (let attempt = 0; attempt < CONTAINER_HEALTH_ATTEMPTS; attempt += 1) {
    const healthyContainer = await findHealthyContainer(containers);

    if (healthyContainer) {
      return healthyContainer;
    }

    if (attempt < CONTAINER_HEALTH_ATTEMPTS - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, CONTAINER_HEALTH_RETRY_DELAY_MS)
      );
    }
  }

  return containers[0] ?? null;
}

export class FaceMatcherContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
  envVars = {
    FACE_MATCHER_DETECTOR_PATH,
    FACE_MATCHER_MODEL_PATH,
    PORT: "8080",
  };
}

const worker = createFaceMatcherWorker({
  getContainer: getContainerInstance,
});

export default worker;
