import { handleApiRequest, type PagesFunctionContext } from "../_shared/proxyHandlers";

export function onRequest(context: PagesFunctionContext) {
  return handleApiRequest(context);
}
