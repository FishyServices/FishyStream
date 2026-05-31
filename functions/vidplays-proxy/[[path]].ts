import { handleProviderProxyRequest, type PagesFunctionContext } from "../_shared/proxyHandlers";

export function onRequest(context: PagesFunctionContext) {
  return handleProviderProxyRequest(context, "vidplays-proxy");
}
