import { handleApiRequest, type PagesFunctionContext } from "../_shared/runtime/proxyHandlers";

export function onRequest(context: PagesFunctionContext) {
  return handleApiRequest(context);
}
