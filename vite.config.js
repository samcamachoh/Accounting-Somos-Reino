import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/* Without an explicit input map Vite treats index.html as the only
   entry, and the two portals never reach dist/. Each page here is
   built and hashed on its own. */
const page = (name) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: page("index"),
        login: page("login"),
        finance: page("finance"),
        giving: page("giving"),
        services: page("services"),
        settings: page("settings"),
      },
    },
  },
});
