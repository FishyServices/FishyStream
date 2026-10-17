import { handleIntroDbRequest } from "@fishy/providers/api";

export function onRequest({ request }: { request: Request }) {
  return handleIntroDbRequest(request);
}
