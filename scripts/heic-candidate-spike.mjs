import { chromium } from "@playwright/test";

const baseUrl = process.env.HEIC_SPIKE_BASE_URL ?? "http://127.0.0.1:4178";
const fixtures = [
  { name: "1.heic", expectedOrientation: "landscape fixture" },
  { name: "10.heic", expectedOrientation: "landscape fixture" },
  { name: "greyhounds-looking-for-a-table.heic", expectedOrientation: "portrait, iPhone 12 Pro" },
  { name: "classic-car.heic", expectedOrientation: "portrait, iPhone 12 Pro" },
  { name: "old-safe-wall.heic", expectedOrientation: "portrait, iPhone 12 Pro" },
];

const testBrowserModule = async (page, label, setup, convert) => {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  return page.evaluate(async ({ label, fixtures, setup, convert, baseUrl }) => {
    const api = await eval(`(${setup})`)(baseUrl);
    const converter = eval(`(${convert})`);
    const rows = [];
    for (const fixture of fixtures) {
      const response = await fetch(`${baseUrl}/fixtures/${encodeURIComponent(fixture.name)}`);
      const input = new File([await response.arrayBuffer()], fixture.name, { type: "image/heic" });
      const started = performance.now();
      try {
        const output = await converter(api, input);
        const outputBytes = new Uint8Array(await output.arrayBuffer());
        const bitmap = await createImageBitmap(output);
        rows.push({
          candidate: label,
          fixture: fixture.name,
          expectedOrientation: fixture.expectedOrientation,
          detected: typeof api.isHeic === "function" ? await api.isHeic(input) : undefined,
          outputType: output.type,
          outputBytes: output.size,
          jpegSignature: outputBytes[0] === 0xff && outputBytes[1] === 0xd8,
          width: bitmap.width,
          height: bitmap.height,
          durationMs: Math.round(performance.now() - started),
          heapUsedBytes: performance.memory?.usedJSHeapSize,
        });
        bitmap.close();
      } catch (error) {
        rows.push({
          candidate: label,
          fixture: fixture.name,
          expectedOrientation: fixture.expectedOrientation,
          detected: typeof api.isHeic === "function" ? await api.isHeic(input).catch(() => undefined) : undefined,
          error: String(error?.stack ?? error),
          durationMs: Math.round(performance.now() - started),
          heapUsedBytes: performance.memory?.usedJSHeapSize,
        });
      }
    }
    return rows;
  }, { label, fixtures, setup: setup.toString(), convert: convert.toString(), baseUrl });
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[browser] ${message.text()}`);
  });

  const heicToRows = await testBrowserModule(
    page,
    "heic-to@1.5.2",
    async (url) => import(`${url}/heic-to/package/dist/heic-to.js`),
    async (api, input) => api.heicTo({ blob: input, type: "image/jpeg", quality: 0.9 }),
  );
  console.log(JSON.stringify(heicToRows, null, 2));

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ url: `${baseUrl}/heic2any/package/dist/heic2any.min.js` });
  const heic2anyRows = await page.evaluate(async ({ fixtures, baseUrl }) => {
    const rows = [];
    for (const fixture of fixtures) {
      const response = await fetch(`${baseUrl}/fixtures/${encodeURIComponent(fixture.name)}`);
      const input = new File([await response.arrayBuffer()], fixture.name, { type: "image/heic" });
      const started = performance.now();
      try {
        const output = await window.heic2any({ blob: input, toType: "image/jpeg", quality: 0.9 });
        const outputBytes = new Uint8Array(await output.arrayBuffer());
        const bitmap = await createImageBitmap(output);
        rows.push({ candidate: "heic2any@0.0.4", fixture: fixture.name, expectedOrientation: fixture.expectedOrientation, outputType: output.type, outputBytes: output.size, jpegSignature: outputBytes[0] === 0xff && outputBytes[1] === 0xd8, width: bitmap.width, height: bitmap.height, durationMs: Math.round(performance.now() - started), heapUsedBytes: performance.memory?.usedJSHeapSize });
        bitmap.close();
      } catch (error) {
        rows.push({ candidate: "heic2any@0.0.4", fixture: fixture.name, expectedOrientation: fixture.expectedOrientation, error: String(error?.stack ?? error), durationMs: Math.round(performance.now() - started), heapUsedBytes: performance.memory?.usedJSHeapSize });
      }
    }
    return rows;
  }, { fixtures, baseUrl });
  console.log(JSON.stringify(heic2anyRows, null, 2));

  const libheifRows = await testBrowserModule(
    page,
    "libheif-js@1.19.8",
    async (url) => {
      const imported = await import(`${url}/libheif-js/package/libheif-wasm/libheif-bundle.mjs`);
      const factory = imported.default ?? imported;
      return typeof factory === "function" ? factory() : factory;
    },
    async (libheif, input) => {
      const decoder = new libheif.HeifDecoder();
      const images = decoder.decode(new Uint8Array(await input.arrayBuffer()));
      if (!images?.length) throw new Error("No decoded image");
      const image = images[0];
      const imageData = new ImageData(image.get_width(), image.get_height());
      await new Promise((resolve, reject) => image.display(imageData, (displayData) => displayData ? resolve() : reject(new Error("Display failed"))));
      const canvas = document.createElement("canvas");
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      canvas.getContext("2d").putImageData(imageData, 0, 0);
      return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("JPEG encode failed")), "image/jpeg", 0.9));
    },
  );
  console.log(JSON.stringify(libheifRows, null, 2));
} finally {
  await browser.close();
}
