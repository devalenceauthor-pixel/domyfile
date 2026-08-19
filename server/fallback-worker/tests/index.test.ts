import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: (binding: { idFromName: (name: string) => string; get: (id: string) => unknown }, name = "cf-singleton-container") => binding.get(binding.idFromName(name)),
}));

const { default: worker, JobStatus, RateLimiter } = await import("../src/index");

const VALID_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const VALID_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

class MemoryStorage {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string) {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown) {
    this.values.set(key, value);
  }

  async deleteAll() {
    this.values.clear();
  }
}

class MemoryBucket {
  readonly objects = new Map<string, Uint8Array>();

  async put(key: string, value: unknown) {
    const bytes = new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
    this.objects.set(key, bytes);
  }

  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const bytes = this.objects.get(key);
    if (!bytes) return undefined;
    const offset = options?.range?.offset ?? 0;
    const length = options?.range?.length ?? bytes.length - offset;
    const selected = bytes.slice(offset, offset + length);
    return {
      size: bytes.length,
      body: new Response(selected).body,
      arrayBuffer: async () => selected.buffer.slice(selected.byteOffset, selected.byteOffset + selected.byteLength),
    };
  }

  async head(key: string) {
    const bytes = this.objects.get(key);
    return bytes ? { size: bytes.length } : undefined;
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

class MemoryQueue {
  readonly messages: Array<{ body: unknown; options?: unknown }> = [];

  async send(body: unknown, options?: unknown) {
    this.messages.push({ body, options });
  }
}

const namespace = <T>(factory: (storage: MemoryStorage) => T) => {
  const states = new Map<string, { storage: MemoryStorage; object: T }>();
  return {
    states,
    idFromName: (name: string) => name,
    get: (id: string) => {
      let value = states.get(id);
      if (!value) {
        const storage = new MemoryStorage();
        value = { storage, object: factory(storage) };
        states.set(id, value);
      }
      return {
        fetch: (input: string | Request, init?: RequestInit) => {
          const request = input instanceof Request ? input : new Request(input, init);
          return (value as { object: { fetch: (request: Request) => Promise<Response> } }).object.fetch(request);
        },
      };
    },
  };
};

type TestEnvironment = {
  env: Record<string, unknown>;
  bucket: MemoryBucket;
  jobQueue: MemoryQueue;
  cleanupQueue: MemoryQueue;
  container: { fetch: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  statusNamespace: ReturnType<typeof namespace>;
};

const jsonRequest = (url: string, value: unknown, headers: Record<string, string> = {}) => {
  const body = JSON.stringify(value);
  return new Request(url, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", "Content-Length": String(new TextEncoder().encode(body).byteLength), ...headers },
  });
};

const createEnvironment = (): TestEnvironment => {
  let containerMode: "success" | "error" | "timeout" = "success";
  const bucket = new MemoryBucket();
  const jobQueue = new MemoryQueue();
  const cleanupQueue = new MemoryQueue();
  const statusNamespace = namespace((storage) => new JobStatus({ storage } as never));
  const rateLimitNamespace = namespace((storage) => new RateLimiter({ storage } as never));

  const container = {
    fetch: vi.fn(async (_url: string, init?: RequestInit) => {
      if (containerMode === "timeout") throw new Error("simulated container timeout");
      if (containerMode === "error") return Response.json({ ok: false, code: "PROCESSING_FAILED" }, { status: 422 });
      const envelope = JSON.parse(String(init?.body)) as Record<string, string | number>;
      const inputResponse = await worker.fetch(new Request(String(envelope.inputUrl), { headers: { "X-DoMyFile-Internal-Token": String(envelope.inputToken) } }), env, {});
      if (!inputResponse.ok || new Uint8Array(await inputResponse.arrayBuffer()).length !== Number(envelope.inputBytes)) throw new Error("input callback mismatch");
      await worker.fetch(jsonRequest(String(envelope.progressUrl), { phase: "processing", progress: 0.5 }, { "X-DoMyFile-Internal-Token": String(envelope.progressToken) }), env, {});
      const outputResponse = await worker.fetch(new Request(String(envelope.outputUrl), {
        method: "PUT",
        body: VALID_PNG,
        headers: { "Content-Type": "image/png", "Content-Length": String(VALID_PNG.byteLength), "X-DoMyFile-Internal-Token": String(envelope.outputToken) },
      }), env, {});
      if (!outputResponse.ok) throw new Error("output callback mismatch");
      return Response.json({ ok: true, result: { inputBytes: Number(envelope.inputBytes), outputBytes: VALID_PNG.byteLength, savingsPercent: 0, outputMime: "image/png", outputFormat: "PNG", width: 1, height: 1 } });
    }),
    destroy: vi.fn(async () => undefined),
  };
  const containerNamespace = {
    idFromName: (name: string) => name,
    get: () => container,
  };

  const env: Record<string, unknown> = {
    TEMP_FILES: bucket,
    JOB_QUEUE: jobQueue,
    CLEANUP_QUEUE: cleanupQueue,
    JOB_STATUS: statusNamespace,
    RATE_LIMITER: rateLimitNamespace,
    COMPRESSION_CONTAINER: containerNamespace,
    GATEWAY_PUBLIC_URL: "https://fallback.test",
    INTERNAL_HMAC_SECRET: "test-secret",
    JOB_QUEUE_NAME: "domyfile-fallback-jobs",
    JOB_DLQ_NAME: "domyfile-fallback-dlq",
    CLEANUP_QUEUE_NAME: "domyfile-fallback-cleanup",
  };

  Object.defineProperty(container, "mode", { set: (value: typeof containerMode) => { containerMode = value; } });
  return { env, bucket, jobQueue, cleanupQueue, container, statusNamespace };
};

const createJob = async (test: TestEnvironment, bytes = VALID_JPEG, inputMime = "image/jpeg", ip = "198.51.100.10") => {
  const response = await worker.fetch(jsonRequest("https://fallback.test/v1/jobs", { toolId: "IMG-12", inputBytes: bytes.byteLength, inputMime, options: { preset: "balanced" } }, { "CF-Connecting-IP": ip }), test.env, {});
  expect(response.status).toBe(201);
  return await response.json() as { jobId: string; accessToken: string; uploadUrl: string };
};

const upload = async (test: TestEnvironment, job: { accessToken: string; uploadUrl: string }, bytes: Uint8Array, inputMime = "image/jpeg") => {
  return await worker.fetch(new Request(job.uploadUrl, {
    method: "PUT",
    body: bytes,
    headers: { Authorization: `Bearer ${job.accessToken}`, "Content-Type": inputMime, "Content-Length": String(bytes.byteLength) },
  }), test.env, {});
};

const status = async (test: TestEnvironment, job: { jobId: string; accessToken: string }) => {
  const response = await worker.fetch(new Request(`https://fallback.test/v1/jobs/${job.jobId}`, { headers: { Authorization: `Bearer ${job.accessToken}` } }), test.env, {});
  return { response, body: await response.json() as Record<string, unknown> };
};

const drain = async (test: TestEnvironment, queue: MemoryQueue, queueName: string) => {
  while (queue.messages.length) {
    const messages = queue.messages.splice(0).map((entry) => ({ body: entry.body }));
    await worker.queue({ queue: queueName, messages }, test.env);
  }
};

describe("Remove Background server fallback lifecycle", () => {
  let test: TestEnvironment;

  beforeEach(() => {
    test = createEnvironment();
  });

  it("processes a private job and deletes input/output at the documented terminal points", async () => {
    const job = await createJob(test);
    const uploadResponse = await upload(test, job, VALID_JPEG);
    expect(uploadResponse.status).toBe(202);
    expect(test.bucket.objects.has(`jobs/${job.jobId}/input`)).toBe(true);

    await drain(test, test.jobQueue, "domyfile-fallback-jobs");
    const ready = await status(test, job);
    expect(ready.body.status).toBe("ready");
    expect(test.bucket.objects.has(`jobs/${job.jobId}/input`)).toBe(false);
    expect(test.bucket.objects.has(`jobs/${job.jobId}/output`)).toBe(true);

    const waits: Promise<unknown>[] = [];
    const download = await worker.fetch(new Request(`https://fallback.test/v1/jobs/${job.jobId}/download`, { headers: { Authorization: `Bearer ${job.accessToken}` } }), test.env, { waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(VALID_PNG);
    await Promise.all(waits);
    expect(test.bucket.objects.has(`jobs/${job.jobId}/output`)).toBe(false);
  });

  it("deletes objects for a processor failure and for a timeout delivered to the DLQ", async () => {
    const failed = await createJob(test);
    await upload(test, failed, VALID_JPEG);
    (test.container as typeof test.container & { mode: string }).mode = "error";
    await drain(test, test.jobQueue, "domyfile-fallback-jobs");
    const failure = await status(test, failed);
    expect(failure.body).toMatchObject({ status: "error", code: "PROCESSING_FAILED" });
    expect(test.bucket.objects.has(`jobs/${failed.jobId}/input`)).toBe(false);
    expect(test.bucket.objects.has(`jobs/${failed.jobId}/output`)).toBe(false);

    const timedOut = await createJob(test, VALID_JPEG, "image/jpeg", "198.51.100.11");
    await upload(test, timedOut, VALID_JPEG);
    (test.container as typeof test.container & { mode: string }).mode = "timeout";
    const queuedMessage = test.jobQueue.messages[0];
    test.jobQueue.messages.splice(0, 1);
    await expect(worker.queue({ queue: "domyfile-fallback-jobs", messages: [{ body: queuedMessage.body }] }, test.env)).rejects.toThrow("container_unavailable");
    expect(test.bucket.objects.has(`jobs/${timedOut.jobId}/input`)).toBe(true);
    await worker.queue({ queue: "domyfile-fallback-dlq", messages: [{ body: queuedMessage.body }] }, test.env);
    const timeoutFailure = await status(test, timedOut);
    expect(timeoutFailure.body).toMatchObject({ status: "error", code: "SERVER_UNAVAILABLE" });
    expect(test.bucket.objects.has(`jobs/${timedOut.jobId}/input`)).toBe(false);
  });

  it("rejects corrupt input before enqueue and cleans the temporary source", async () => {
    const job = await createJob(test);
    const response = await upload(test, job, new Uint8Array([0x00, 0x01, 0x02, 0x03]));
    expect(response.status).toBe(415);
    expect(test.jobQueue.messages).toHaveLength(0);
    expect(test.bucket.objects.has(`jobs/${job.jobId}/input`)).toBe(false);
    const result = await status(test, job);
    expect(result.body).toMatchObject({ status: "error", code: "UNSUPPORTED_FORMAT" });
  });

  it("cleans cancelled and expired abandoned jobs and purges expired state", async () => {
    const cancelled = await createJob(test);
    await upload(test, cancelled, VALID_JPEG);
    const cancelResponse = await worker.fetch(new Request(`https://fallback.test/v1/jobs/${cancelled.jobId}`, { method: "DELETE", headers: { Authorization: `Bearer ${cancelled.accessToken}` } }), test.env, {});
    expect(cancelResponse.status).toBe(204);
    expect(test.container.destroy).toHaveBeenCalledTimes(1);
    expect(test.bucket.objects.has(`jobs/${cancelled.jobId}/input`)).toBe(false);
    await drain(test, test.jobQueue, "domyfile-fallback-jobs");
    expect(test.container.fetch).not.toHaveBeenCalled();

    const abandoned = await createJob(test, VALID_JPEG, "image/jpeg", "198.51.100.12");
    const state = test.statusNamespace.states.get(abandoned.jobId);
    const record = await state?.storage.get<Record<string, unknown>>("job");
    await state?.storage.put("job", { ...record, expiresAt: new Date(0).toISOString() });
    await test.bucket.put(`jobs/${abandoned.jobId}/input`, VALID_JPEG);
    await test.bucket.put(`jobs/${abandoned.jobId}/output`, VALID_PNG);
    await drain(test, test.cleanupQueue, "domyfile-fallback-cleanup");
    expect(test.bucket.objects.has(`jobs/${abandoned.jobId}/input`)).toBe(false);
    expect(test.bucket.objects.has(`jobs/${abandoned.jobId}/output`)).toBe(false);
    const expired = await worker.fetch(new Request(`https://fallback.test/v1/jobs/${abandoned.jobId}`, { headers: { Authorization: `Bearer ${abandoned.accessToken}` } }), test.env, {});
    expect(expired.status).toBe(401);
  });
});
