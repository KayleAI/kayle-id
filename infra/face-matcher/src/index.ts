import { Container, getRandom } from "@cloudflare/containers";
import type { ContainerFetcher } from "./worker";
import { createFaceMatcherWorker, FACE_MATCHER_MODEL_PATH } from "./worker";

const FACE_MATCHER_CONTAINER_COUNT = 2;

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

async function getContainerInstance(
  env: unknown
): Promise<ContainerFetcher | null> {
  const binding = resolveContainerBinding(env);

  if (!binding) {
    return null;
  }

  const container = await getRandom(binding, FACE_MATCHER_CONTAINER_COUNT);
  return container as unknown as ContainerFetcher;
}

export class FaceMatcherContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
  envVars = {
    FACE_MATCHER_MODEL_PATH,
    PORT: "8080",
  };
}

const worker = createFaceMatcherWorker({
  getContainer: getContainerInstance,
});

export default worker;
