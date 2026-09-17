import { defineConfig } from "vite";

/* One page. index.html is Vite's default entry, so there is no
   input map to keep in step with the pages on disk any more —
   which is what the old build kept silently dropping a portal
   over. Views are ES modules imported by src/app.js and are
   code-split and hashed automatically. */
export default defineConfig({
  build: {
    target: "es2022",
    /* The whole portal is one route; splitting it into fifteen
       lazy chunks would trade a fast first paint for a stall on
       every rail click. */
    chunkSizeWarningLimit: 700,
  },
});
