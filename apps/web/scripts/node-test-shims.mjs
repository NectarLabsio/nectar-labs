// `node --test --import ./scripts/node-test-shims.mjs …`: lets plain Node load server modules.
// Next resolves `import "server-only"` itself (empty on the server, a build error in client bundles); Node has no such package,
// so this resolve hook maps it to an empty module for tests only.
import { register } from "node:module";

const hooks = `export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
