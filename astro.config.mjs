import { defineConfig } from "astro/config";
import { SITE_ORIGIN } from "./src/config/site";

export default defineConfig({
  output: "static",
  trailingSlash: "always",
  site: SITE_ORIGIN,
  redirects: {
    "/image/image-converter": `${SITE_ORIGIN}/image/`,
    "/pdf/images-to-pdf": `${SITE_ORIGIN}/pdf/`,
  },
});
