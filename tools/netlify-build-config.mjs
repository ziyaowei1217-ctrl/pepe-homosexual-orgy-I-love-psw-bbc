import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

import { validateAuthProviderConfig, validateMapConfig } from "./production-config.mjs";

function publicHttpsUrl(value, name, errors, { api = false, origin = false } = {}) {
  if (!value?.trim()) { errors.push(`${name} is required`); return; }
  let url;
  try { url = new URL(value); } catch { errors.push(`${name} must be a valid HTTPS URL`); return; }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    errors.push(`${name} must use HTTPS without credentials, a query or a fragment`);
  }
  // A Netlify function cannot reach a local Compose hostname. Reject literals
  // and reserved examples too, so an unconfigured account cannot publish a
  // frontend that silently points to a laptop or documentation placeholder.
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || isIP(host.replace(/^\[|\]$/g, "")) ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test|example|example\.com|example\.org|example\.net)$/.test(host)) {
    errors.push(`${name} must point to a configured public service hostname`);
  }
  if (api && !url.pathname.endsWith("/api/v1")) errors.push(`${name} must end with /api/v1`);
  if (origin && url.pathname !== "/") errors.push(`${name} must be an HTTPS origin without a path`);
}

/** Frontend-only gate: private database/email/storage credentials belong on the API host. */
export function validateNetlifyBuildConfig(environment) {
  const errors = [];
  for (const name of ["NEXT_PUBLIC_WEBSITE_DEMO", "NEXT_PUBLIC_ENABLE_PREVIEW_DATA"]) {
    if (environment[name] && environment[name] !== "false") errors.push(`${name} must be unset or false for the connected website`);
  }
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") errors.push("TLS verification must remain enabled");
  errors.push(...validateAuthProviderConfig(environment, true));
  publicHttpsUrl(environment.NEXT_PUBLIC_API_BASE_URL, "NEXT_PUBLIC_API_BASE_URL", errors, { api: true });
  if (environment.API_INTERNAL_BASE_URL?.trim()) publicHttpsUrl(environment.API_INTERNAL_BASE_URL, "API_INTERNAL_BASE_URL", errors, { api: true });
  publicHttpsUrl(environment.NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN, "NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN", errors, { origin: true });
  errors.push(...validateMapConfig(environment));
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateNetlifyBuildConfig(process.env);
  if (errors.length) {
    // Report field names and expected shapes only, never configured values.
    console.error(`Connected Netlify configuration is incomplete:\n- ${errors.join("\n- ")}`);
    process.exitCode = 1;
  } else console.log("Connected Netlify frontend configuration is complete.");
}
