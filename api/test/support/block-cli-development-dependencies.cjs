const Module = require("node:module");
const { devDependencies = {} } = require("../../package.json");

const blockedPackages = new Set(Object.keys(devDependencies));

function requestedPackage(request) {
  if (typeof request !== "string" || request.startsWith(".") || request.startsWith("/") || request.startsWith("node:")) {
    return undefined;
  }
  const segments = request.split("/");
  return request.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

const originalLoad = Module._load;
Module._load = function blockedDevelopmentDependency(request, parent, isMain) {
  let resolved = "";
  try {
    resolved = Module._resolveFilename(request, parent, isMain);
  } catch {
    // Let Node produce its normal resolution error for unrelated modules.
  }
  const directPackage = requestedPackage(request);
  const resolvedPath = resolved.replaceAll("\\", "/");
  const resolvedPackage = [...blockedPackages].find((packageName) =>
    resolvedPath.includes(`/node_modules/${packageName}/`)
  );
  if ((directPackage && blockedPackages.has(directPackage)) || resolvedPackage) {
    throw new Error("CLI_DEVELOPMENT_DEPENDENCY_LOADED");
  }
  return originalLoad.call(this, request, parent, isMain);
};
