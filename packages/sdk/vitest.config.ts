import { configDefaults, defineConfig } from "vitest/config";

// The repo lives on exFAT; macOS writes "._*" AppleDouble files next to every file.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "**/._*"] } });
