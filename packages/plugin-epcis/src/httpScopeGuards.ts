import type { express } from "@dkg/plugins/types";

type EpcisHttpMethod = "get" | "post";
type EpcisScope = "epcis.read" | "epcis.write";

export const EPCIS_ROUTE_PATHS = {
  capture: "/epcis/capture",
  captureStatus: "/epcis/capture/:captureID",
  events: "/epcis/events",
  trackEvents: "/epcis/events/track",
} as const;

export type EpcisHttpScopeRule = {
  method: EpcisHttpMethod;
  path: string;
  requiredScope: EpcisScope;
};

export const EPCIS_HTTP_SCOPE_RULES: readonly EpcisHttpScopeRule[] = [
  {
    method: "get",
    path: EPCIS_ROUTE_PATHS.events,
    requiredScope: "epcis.read",
  },
  {
    method: "get",
    path: EPCIS_ROUTE_PATHS.trackEvents,
    requiredScope: "epcis.read",
  },
  {
    method: "get",
    path: EPCIS_ROUTE_PATHS.captureStatus,
    requiredScope: "epcis.write",
  },
  {
    method: "post",
    path: EPCIS_ROUTE_PATHS.capture,
    requiredScope: "epcis.write",
  },
];

type ScopeMiddlewareFactory = (
  requiredScopes: string[],
) => express.RequestHandler;

export function applyEpcisHttpScopeGuards(
  api: express.Router,
  authorize: ScopeMiddlewareFactory,
): void {
  for (const { method, path, requiredScope } of EPCIS_HTTP_SCOPE_RULES) {
    api[method](path, authorize([requiredScope]));
  }
}
