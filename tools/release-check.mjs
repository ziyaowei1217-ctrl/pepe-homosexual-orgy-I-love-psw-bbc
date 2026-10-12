import { spawnSync } from "node:child_process";
import { requireTestInfrastructure } from "./infrastructure-env.mjs";

try { requireTestInfrastructure(); }
catch (error) {
  console.error(error.message);
  process.exit(1);
}

const gates = [
  ["check"],
  ["-C", "api", "launch:check"],
  ["exec", "node", "tools/infrastructure-check.mjs"]
];

for (const args of gates) {
  // Default unit suites deliberately test absent configuration and local defaults.
  // Only the infrastructure gate receives live service configuration and enabling flags.
  const environment = { ...process.env };
  if (args[0] !== "exec") {
    for (const key of Object.keys(environment)) {
      if (/^(RUN_.*_SMOKE|DATABASE_URL$|NEXT_PUBLIC_|API_INTERNAL_BASE_URL$|LISTING_MEDIA_|VALKEY_URL$|TEST_DATABASE_|JWT_SECRET$|OTP_HASH_SECRET$|SECURITY_IDENTIFIER_HASH_SECRET$|MFA_ENCRYPTION_KEY$|EMAIL_|RESEND_API_KEY$|PAYMENT_SERVICE_|LOCAL_ADMIN_EMAILS$|NODE_ENV$)/.test(key)) delete environment[key];
    }
  }
  const result = spawnSync("pnpm", args, { stdio: "inherit", env: environment });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
