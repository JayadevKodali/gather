import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the embedded Postgres used in demo mode) ships WebAssembly files,
  // so Next must load it from node_modules rather than bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The demo database applies these SQL files at startup, so ship them with the server code.
  outputFileTracingIncludes: { "/**": ["./supabase/migrations/*.sql"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
