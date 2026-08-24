import { handleSmryFetch } from "../_lib/article-proxy";

type PagesContext = { request: Request };

export async function onRequest(context: PagesContext) {
  return handleSmryFetch(context.request);
}
