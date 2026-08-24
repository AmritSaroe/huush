import { genericAdapter } from "./generic-adapter.js";
import { economicTimesAdapter } from "../publishers/economic-times.js";
import { theHinduAdapter } from "../publishers/the-hindu.js";
import { businessStandardAdapter } from "../publishers/business-standard.js";
import { businessLineAdapter } from "../publishers/business-line.js";
import { indianExpressAdapter } from "../publishers/indian-express.js";
import { financialExpressAdapter } from "../publishers/financial-express.js";
import { finshotsAdapter } from "../publishers/finshots.js";
import { liveMintAdapter } from "../publishers/live-mint.js";
import { pibAdapter } from "../publishers/pib.js";
import { epwAdapter } from "../publishers/epw.js";
import { noemaAdapter } from "../publishers/noema.js";

// Order matters when publisher domains overlap. Economic Times is kept first
// because it owns the dedicated JSON/storyJSON and Prime-gate implementation.
const ADAPTERS = [
  economicTimesAdapter,
  theHinduAdapter,
  businessStandardAdapter,
  businessLineAdapter,
  indianExpressAdapter,
  financialExpressAdapter,
  finshotsAdapter,
  liveMintAdapter,
  pibAdapter,
  epwAdapter,
  noemaAdapter,
];

export function getPublisherAdapter(url) {
  return ADAPTERS.find((adapter) => adapter.matches(url)) || genericAdapter;
}

export function listPublisherAdapters() {
  return [...ADAPTERS, genericAdapter];
}

export { genericAdapter };
