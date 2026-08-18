import { Container, getContainer } from "@cloudflare/containers";
import type {
  DurableObjectNamespace,
  DurableObjectState,
  MessageBatch,
  Queue,
  R2Bucket,
} from "@cloudflare/workers-types";
import {
  SERVER_FALLBACK_LIMITS,
  SERVER_TOOL_OUTPUTS,
  isServerToolId,
  normalizeServerOptions,
  type ServerErrorCode,
  type ServerJobOptions,
  type ServerJobResult,
  type ServerJobStatus,
  type ServerToolId,
} from "../../../src/tools/server-fallback/types";

type WorkerEnv = {
  TEMP_FILES: R2Bucket;
  JOB_QUEUE: Queue;
  CLEANUP_QUEUE: Queue;
  JOB_STATUS: DurableObjectNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  COMPRESSION_CONTAINER: DurableObjectNamespace;
  GATEWAY_PUBLIC_URL: string;
  INTERNAL_HMAC_SECRET?: string;
  JOB_QUEUE_NAME: string;
  JOB_DLQ_NAME: string;
  CLEANUP_QUEUE_NAME: string;
};

type StoredJob = {
  jobId: string;
  toolId: ServerToolId;
  preset: ServerJobOptions["preset"];
  inputBytes: number;
  inputMime: string;
  inputKey: string;
  outputKey: string;
  accessTokenHash: string;
  status: ServerJobStatus;
  progress?: number;
  code?: ServerErrorCode;
  createdAt: string;
  expiresAt: string;
  result?: ServerJobResult;
};

type ProcessMessage = {
  kind: "process";
  jobId: string;
  toolId: ServerToolId;
  preset: ServerJobOptions["preset"];
  expiresAt: string;
};

type CleanupMessage = {
  kind: "expire" | "purge";
  jobId: string;
};

type QueueMessage = ProcessMessage | CleanupMessage;

type CreateRequest = {
  toolId: ServerToolId;
  inputBytes: number;
  inputMime: string;
  options: ServerJobOptions;
};

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const INTERNAL_TOKEN_HEADER = "X-DoMyFile-Internal-Token";
const textEncoder = new TextEncoder();

const json = (value: unknown, status = 200, headers: HeadersInit = {}) => Response.json(value, {
  status,
  headers: { ...JSON_HEADERS, ...headers },
});

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asErrorCode = (value: unknown): ServerErrorCode | undefined => {
  const codes: ServerErrorCode[] = [
    "INVALID_INPUT", "UNSUPPORTED_FORMAT", "CORRUPT_FILE", "ENCRYPTED_PDF_UNSUPPORTED",
    "RESOURCE_LIMIT", "UPLOAD_FAILED", "SERVER_UNAVAILABLE", "RATE_LIMITED", "NO_USEFUL_REDUCTION",
    "OUTPUT_INVALID", "JOB_EXPIRED", "CANCELLED", "PROCESSING_FAILED",
  ];
  return typeof value === "string" && codes.includes(value as ServerErrorCode) ? value as ServerErrorCode : undefined;
};

const getLimits = (toolId: ServerToolId) => SERVER_FALLBACK_LIMITS[toolId];

const nowIso = () => new Date().toISOString();

const isExpired = (record: Pick<StoredJob, "expiresAt">) => Date.now() >= Date.parse(record.expiresAt);

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const digest = async (value: string) => {
  const hash = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const internalSecret = (env: WorkerEnv) => {
  if (!env.INTERNAL_HMAC_SECRET) throw new Error("INTERNAL_HMAC_SECRET is not configured");
  return env.INTERNAL_HMAC_SECRET;
};

const internalToken = async (env: WorkerEnv, jobId: string, action: string) => {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(internalSecret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(`${jobId}:${action}`));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const hasValidInternalToken = async (request: Request, env: WorkerEnv, jobId: string, action: string) => {
  const supplied = request.headers.get(INTERNAL_TOKEN_HEADER);
  if (!supplied) return false;
  return supplied === await internalToken(env, jobId, action);
};

const parseJsonBody = async (request: Request, maxBytes: number) => {
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (!Number.isFinite(length) || length <= 0 || length > maxBytes) throw new Error("invalid_json_body");
  return await request.json() as unknown;
};

const publicJob = (record: StoredJob) => ({
  jobId: record.jobId,
  status: record.status,
  ...(record.progress === undefined ? {} : { progress: record.progress }),
  ...(record.code ? { code: record.code } : {}),
  expiresAt: record.expiresAt,
  ...(record.result ? { result: record.result } : {}),
});

export class JobStatus {
  constructor(private readonly state: DurableObjectState) {}

  private async read() {
    return await this.state.storage.get<StoredJob>("job");
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/create") {
      const value = await request.json() as StoredJob;
      await this.state.storage.put("job", value);
      return json({ ok: true });
    }
    if (request.method === "GET" && url.pathname === "/record") {
      const record = await this.read();
      return record ? json(record) : json({ code: "JOB_EXPIRED" }, 404);
    }
    if (request.method === "GET" && url.pathname === "/public") {
      const record = await this.read();
      if (!record) return json({ code: "JOB_EXPIRED" }, 404);
      const authorization = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!authorization || await digest(authorization) !== record.accessTokenHash) return json({ code: "INVALID_INPUT" }, 401);
      return json(publicJob(record));
    }
    if (request.method === "POST" && url.pathname === "/update") {
      const record = await this.read();
      if (!record) return json({ code: "JOB_EXPIRED" }, 404);
      const update = await request.json() as Partial<StoredJob>;
      const next: StoredJob = {
        ...record,
        ...update,
        jobId: record.jobId,
        toolId: record.toolId,
        inputKey: record.inputKey,
        outputKey: record.outputKey,
        accessTokenHash: record.accessTokenHash,
      };
      await this.state.storage.put("job", next);
      return json({ ok: true });
    }
    if (request.method === "DELETE" && url.pathname === "/purge") {
      await this.state.storage.deleteAll();
      return json({ ok: true });
    }
    return json({ code: "INVALID_INPUT" }, 404);
  }
}

export class RateLimiter {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    const input = await request.json() as { limit?: number; windowSeconds?: number };
    const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 10)));
    const windowSeconds = Math.max(1, Math.min(3600, Math.floor(input.windowSeconds ?? 60)));
    const current = await this.state.storage.get<{ count: number; startedAt: number }>("window");
    const now = Date.now();
    const windowIsCurrent = current && now - current.startedAt < windowSeconds * 1000;
    const next = windowIsCurrent ? { count: current.count + 1, startedAt: current.startedAt } : { count: 1, startedAt: now };
    if (next.count > limit) {
      return json({ allowed: false, retryAfter: Math.max(1, Math.ceil((next.startedAt + windowSeconds * 1000 - now) / 1000)) }, 429, { "Retry-After": String(Math.max(1, Math.ceil((next.startedAt + windowSeconds * 1000 - now) / 1000))) });
    }
    await this.state.storage.put("window", next);
    return json({ allowed: true });
  }
}

export class CompressionContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
}

const statusStub = (env: WorkerEnv, jobId: string) => env.JOB_STATUS.get(env.JOB_STATUS.idFromName(jobId));

const getInternalRecord = async (env: WorkerEnv, jobId: string) => {
  const response = await statusStub(env, jobId).fetch("https://job-status/record");
  if (!response.ok) return undefined;
  return await response.json() as StoredJob;
};

const getAuthorizedRecord = async (env: WorkerEnv, jobId: string, request: Request) => {
  const response = await statusStub(env, jobId).fetch("https://job-status/public", {
    headers: { Authorization: request.headers.get("Authorization") ?? "" },
  });
  if (!response.ok) return undefined;
  return await response.json() as ReturnType<typeof publicJob>;
};

const updateJob = async (env: WorkerEnv, jobId: string, update: Partial<StoredJob>) => {
  await statusStub(env, jobId).fetch("https://job-status/update", {
    method: "POST",
    headers: { ...JSON_HEADERS },
    body: JSON.stringify(update),
  });
};

const deleteJobObjects = async (env: WorkerEnv, record: Pick<StoredJob, "inputKey" | "outputKey">) => {
  await Promise.all([
    env.TEMP_FILES.delete(record.inputKey),
    env.TEMP_FILES.delete(record.outputKey),
  ]);
};

const expireJob = async (env: WorkerEnv, jobId: string) => {
  const record = await getInternalRecord(env, jobId);
  if (!record) return;
  if (!record.status || ["expired", "cancelled"].includes(record.status)) return;
  await updateJob(env, jobId, { status: "expired", code: "JOB_EXPIRED", progress: undefined });
  await deleteJobObjects(env, record);
  await env.CLEANUP_QUEUE.send({ kind: "purge", jobId } satisfies CleanupMessage, { delaySeconds: 60 });
};

const failJob = async (env: WorkerEnv, record: StoredJob, code: ServerErrorCode) => {
  await updateJob(env, record.jobId, { status: "error", code, progress: undefined });
  await deleteJobObjects(env, record);
};

const validateCreateRequest = (value: unknown): CreateRequest => {
  if (!isRecord(value) || !isServerToolId(String(value.toolId))) throw new Error("invalid_tool");
  const toolId = String(value.toolId) as ServerToolId;
  const limits = getLimits(toolId);
  const inputBytes = Number(value.inputBytes);
  const inputMime = String(value.inputMime ?? "");
  if (!Number.isSafeInteger(inputBytes) || inputBytes <= 0 || inputBytes > limits.maxUploadBytes) throw new Error("resource_limit");
  const allowedMimes = toolId === "PDF-01" ? ["application/pdf"] : ["video/mp4", "video/quicktime"];
  if (!allowedMimes.includes(inputMime)) throw new Error("unsupported_mime");
  const options = normalizeServerOptions(toolId, value.options);
  return { toolId, inputBytes, inputMime, options };
};

const readHead = async (bucket: R2Bucket, key: string, length = 64) => {
  const object = await bucket.get(key, { range: { offset: 0, length } });
  return object ? new Uint8Array(await object.arrayBuffer()) : undefined;
};

const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length));

const hasVideoBrand = (bytes: Uint8Array, allowed: Set<string>) => {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== "ftyp") return false;
  if (allowed.has(ascii(bytes, 8, 4))) return true;
  for (let offset = 16; offset + 4 <= bytes.length; offset += 4) if (allowed.has(ascii(bytes, offset, 4))) return true;
  return false;
};

const inputMagicIsValid = (toolId: ServerToolId, mime: string, bytes: Uint8Array) => {
  if (toolId === "PDF-01") return mime === "application/pdf" && ascii(bytes, 0, 5) === "%PDF-";
  if (mime === "video/quicktime") return hasVideoBrand(bytes, new Set(["qt  "]));
  return mime === "video/mp4" && hasVideoBrand(bytes, new Set(["isom", "iso2", "iso5", "mp41", "mp42", "avc1", "M4V "]));
};

const outputMagicIsValid = (toolId: ServerToolId, bytes: Uint8Array) => toolId === "PDF-01"
  ? ascii(bytes, 0, 5) === "%PDF-"
  : bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;

const rateLimit = async (request: Request, env: WorkerEnv) => {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(`ip:${ip}`));
  const response = await stub.fetch("https://rate-limit/check", {
    method: "POST",
    headers: { ...JSON_HEADERS },
    body: JSON.stringify({ limit: 10, windowSeconds: 60 }),
  });
  return response.ok;
};

const createJob = async (request: Request, env: WorkerEnv) => {
  if (!(await rateLimit(request, env))) return json({ code: "RATE_LIMITED" }, 429);
  let parsed: CreateRequest;
  try {
    parsed = validateCreateRequest(await parseJsonBody(request, 32 * 1024));
  } catch (error) {
    const code = error instanceof Error && error.message === "resource_limit" ? "RESOURCE_LIMIT" : "INVALID_INPUT";
    return json({ code }, code === "RESOURCE_LIMIT" ? 413 : 400);
  }
  const jobId = crypto.randomUUID().replaceAll("-", "");
  const accessToken = randomToken();
  const limits = getLimits(parsed.toolId);
  const expiresAt = new Date(Date.now() + limits.ttlSeconds * 1000).toISOString();
  const record: StoredJob = {
    jobId,
    toolId: parsed.toolId,
    preset: parsed.options.preset,
    inputBytes: parsed.inputBytes,
    inputMime: parsed.inputMime,
    inputKey: `jobs/${jobId}/input`,
    outputKey: `jobs/${jobId}/output`,
    accessTokenHash: await digest(accessToken),
    status: "created",
    createdAt: nowIso(),
    expiresAt,
  };
  await statusStub(env, jobId).fetch("https://job-status/create", {
    method: "POST",
    headers: { ...JSON_HEADERS },
    body: JSON.stringify(record),
  });
  try {
    await env.CLEANUP_QUEUE.send({ kind: "expire", jobId } satisfies CleanupMessage, { delaySeconds: limits.ttlSeconds });
  } catch {
    await deleteJobObjects(env, record);
    await statusStub(env, jobId).fetch("https://job-status/purge", { method: "DELETE" });
    return json({ code: "SERVER_UNAVAILABLE" }, 503);
  }
  const base = env.GATEWAY_PUBLIC_URL.replace(/\/$/, "");
  return json({
    jobId,
    accessToken,
    uploadUrl: `${base}/v1/jobs/${jobId}/input`,
    expiresAt,
  }, 201);
};

const uploadInput = async (request: Request, env: WorkerEnv, jobId: string) => {
  const publicRecord = await getAuthorizedRecord(env, jobId, request);
  if (!publicRecord) return json({ code: "INVALID_INPUT" }, 401);
  const record = await getInternalRecord(env, jobId);
  if (!record) return json({ code: "JOB_EXPIRED" }, 404);
  if (isExpired(record)) {
    await expireJob(env, jobId);
    return json({ code: "JOB_EXPIRED" }, 410);
  }
  if (record.status !== "created") return json({ code: "INVALID_INPUT" }, 409);
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (!Number.isSafeInteger(contentLength) || contentLength !== record.inputBytes) return json({ code: "RESOURCE_LIMIT" }, 413);
  if (!request.body) return json({ code: "UPLOAD_FAILED" }, 400);
  await updateJob(env, jobId, { status: "uploading" });
  await env.TEMP_FILES.put(record.inputKey, request.body as never, { httpMetadata: { contentType: record.inputMime } });
  const head = await readHead(env.TEMP_FILES, record.inputKey);
  if (!head || !inputMagicIsValid(record.toolId, record.inputMime, head)) {
    await failJob(env, record, "UNSUPPORTED_FORMAT");
    return json({ code: "UNSUPPORTED_FORMAT" }, 415);
  }
  try {
    await env.JOB_QUEUE.send({ kind: "process", jobId, toolId: record.toolId, preset: record.preset, expiresAt: record.expiresAt } satisfies ProcessMessage);
    await updateJob(env, jobId, { status: "queued", progress: undefined });
  } catch {
    await failJob(env, record, "SERVER_UNAVAILABLE");
    return json({ code: "SERVER_UNAVAILABLE" }, 503);
  }
  return json({ ok: true }, 202);
};

const normalizeContainerResult = (record: StoredJob, value: unknown): ServerJobResult | undefined => {
  if (!isRecord(value)) return undefined;
  const expected = SERVER_TOOL_OUTPUTS[record.toolId];
  const inputBytes = Number(value.inputBytes ?? record.inputBytes);
  const outputBytes = Number(value.outputBytes);
  const savingsPercent = Number(value.savingsPercent);
  if (!Number.isSafeInteger(outputBytes) || outputBytes <= 0 || !Number.isFinite(savingsPercent)) return undefined;
  if (value.outputMime !== expected.mime || value.outputFormat !== expected.format) return undefined;
  const result: ServerJobResult = { inputBytes, outputBytes, savingsPercent, outputMime: expected.mime, outputFormat: expected.format };
  for (const key of ["durationSeconds", "width", "height", "audioStreams", "pageCount", "textPagesPreserved"] as const) {
    const number = Number(value[key]);
    if (Number.isFinite(number)) result[key] = number;
  }
  return result;
};

const processMessage = async (message: ProcessMessage, env: WorkerEnv, fromDlq: boolean) => {
  const record = await getInternalRecord(env, message.jobId);
  if (!record || record.status === "cancelled" || record.status === "expired" || record.status === "error" || record.status === "ready") return;
  if (isExpired(record)) {
    await expireJob(env, record.jobId);
    return;
  }
  await updateJob(env, record.jobId, { status: "validating", progress: 0.05 });
  const base = env.GATEWAY_PUBLIC_URL.replace(/\/$/, "");
  const inputToken = await internalToken(env, record.jobId, "input");
  const outputToken = await internalToken(env, record.jobId, "output");
  const progressToken = await internalToken(env, record.jobId, "progress");
  const limits = getLimits(record.toolId);
  const container = getContainer(
    env.COMPRESSION_CONTAINER as unknown as Parameters<typeof getContainer>[0],
    record.jobId,
  ) as unknown as { fetch(input: string, init?: RequestInit): Promise<Response> };
  const envelope = {
    jobId: record.jobId,
    toolId: record.toolId,
    preset: record.preset,
    inputBytes: record.inputBytes,
    inputMime: record.inputMime,
    expiresAt: record.expiresAt,
    inputUrl: `${base}/internal/jobs/${record.jobId}/input`,
    outputUrl: `${base}/internal/jobs/${record.jobId}/output`,
    progressUrl: `${base}/internal/jobs/${record.jobId}/progress`,
    inputToken,
    outputToken,
    progressToken,
    limits,
  };
  let response: Response;
  try {
    response = await container.fetch("https://compression-container/process", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-DoMyFile-Internal-Token": progressToken },
      body: JSON.stringify(envelope),
    });
  } catch {
    if (!fromDlq) throw new Error("container_unavailable");
    await failJob(env, record, "SERVER_UNAVAILABLE");
    return;
  }
  const body = await response.json().catch(() => undefined) as { ok?: boolean; code?: string; result?: unknown } | undefined;
  if (!response.ok || !body?.ok) {
    const code = asErrorCode(body?.code) ?? "PROCESSING_FAILED";
    if (response.status >= 500 && !fromDlq) throw new Error("container_retry");
    await failJob(env, record, code);
    return;
  }
  const result = normalizeContainerResult(record, body.result);
  const outputHead = await env.TEMP_FILES.head(record.outputKey);
  const outputLimit = limits.maxOutputBytes;
  const outputMagic = await readHead(env.TEMP_FILES, record.outputKey);
  if (!result || !outputHead || outputHead.size <= 0 || outputHead.size > outputLimit || !outputMagic || !outputMagicIsValid(record.toolId, outputMagic) || outputHead.size >= record.inputBytes) {
    await failJob(env, record, outputHead && outputHead.size >= record.inputBytes ? "NO_USEFUL_REDUCTION" : "OUTPUT_INVALID");
    return;
  }
  const savingsPercent = (1 - outputHead.size / record.inputBytes) * 100;
  if (savingsPercent < limits.minimumSavingsPercent) {
    await failJob(env, record, "NO_USEFUL_REDUCTION");
    return;
  }
  const finalResult = { ...result, inputBytes: record.inputBytes, outputBytes: outputHead.size, savingsPercent } satisfies ServerJobResult;
  const latest = await getInternalRecord(env, record.jobId);
  if (!latest || latest.status === "cancelled" || latest.status === "expired") {
    await deleteJobObjects(env, record);
    return;
  }
  await updateJob(env, record.jobId, { status: "ready", progress: 1, result: finalResult, code: undefined });
  await env.TEMP_FILES.delete(record.inputKey);
};

const handleQueue = async (batch: MessageBatch<QueueMessage>, env: WorkerEnv) => {
  const fromDlq = batch.queue === env.JOB_DLQ_NAME;
  for (const message of batch.messages) {
    const body = message.body;
    if (!isRecord(body) || typeof body.kind !== "string") continue;
    if (body.kind === "expire" && typeof body.jobId === "string") {
      await expireJob(env, body.jobId);
      continue;
    }
    if (body.kind === "purge" && typeof body.jobId === "string") {
      await statusStub(env, body.jobId).fetch("https://job-status/purge", { method: "DELETE" });
      continue;
    }
    if (body.kind !== "process" || typeof body.jobId !== "string" || !isServerToolId(String(body.toolId))) continue;
    await processMessage({
      kind: "process",
      jobId: body.jobId,
      toolId: String(body.toolId) as ServerToolId,
      preset: body.preset === "quality" || body.preset === "smaller" ? body.preset : "balanced",
      expiresAt: String(body.expiresAt ?? ""),
    }, env, fromDlq);
  }
};

const handleStatus = async (request: Request, env: WorkerEnv, jobId: string) => {
  const record = await getAuthorizedRecord(env, jobId, request);
  if (!record) return json({ code: "INVALID_INPUT" }, 401);
  if (record.status === "created" || record.status === "uploading" || record.status === "queued" || record.status === "validating" || record.status === "processing" || record.status === "verifying") {
    const internal = await getInternalRecord(env, jobId);
    if (internal && isExpired(internal)) {
      await expireJob(env, jobId);
      return json({ jobId, status: "expired", code: "JOB_EXPIRED", expiresAt: internal.expiresAt }, 410);
    }
  }
  return json(record);
};

const handleCancel = async (request: Request, env: WorkerEnv, jobId: string) => {
  const publicRecord = await getAuthorizedRecord(env, jobId, request);
  if (!publicRecord) return json({ code: "INVALID_INPUT" }, 401);
  const record = await getInternalRecord(env, jobId);
  if (!record) return json({ code: "JOB_EXPIRED" }, 404);
  await updateJob(env, jobId, { status: "cancelled", code: "CANCELLED", progress: undefined });
  await deleteJobObjects(env, record);
  try {
    const container = getContainer(
      env.COMPRESSION_CONTAINER as unknown as Parameters<typeof getContainer>[0],
      jobId,
    ) as unknown as { destroy?: () => Promise<void> };
    await container.destroy?.();
  } catch {
    // Cleanup is repeated by the TTL queue even if the on-demand instance is already gone.
  }
  return new Response(null, { status: 204 });
};

type WorkerExecutionContext = { waitUntil(promise: Promise<unknown>): void };

const handleDownload = async (request: Request, env: WorkerEnv, ctx: WorkerExecutionContext, jobId: string) => {
  const publicRecord = await getAuthorizedRecord(env, jobId, request);
  if (!publicRecord) return json({ code: "INVALID_INPUT" }, 401);
  if (publicRecord.status !== "ready") return json({ code: publicRecord.status === "expired" ? "JOB_EXPIRED" : "OUTPUT_INVALID" }, 409);
  const record = await getInternalRecord(env, jobId);
  if (!record || isExpired(record)) return json({ code: "JOB_EXPIRED" }, 410);
  const object = await env.TEMP_FILES.get(record.outputKey);
  if (!object) return json({ code: "OUTPUT_INVALID" }, 410);
  const headers = new Headers();
  headers.set("Content-Type", SERVER_TOOL_OUTPUTS[record.toolId].mime);
  headers.set("Content-Length", String(object.size));
  headers.set("Content-Disposition", `attachment; filename="compressed-${record.toolId === "PDF-01" ? "document.pdf" : "video.webm"}"`);
  headers.set("Cache-Control", "no-store, max-age=0");
  ctx.waitUntil(env.TEMP_FILES.delete(record.outputKey));
  return new Response(object.body as unknown as BodyInit, { headers });
};

const handleInternal = async (request: Request, env: WorkerEnv, pathname: string) => {
  const match = pathname.match(/^\/internal\/jobs\/([a-f0-9]{32})\/(input|output|progress)$/);
  if (!match) return json({ code: "INVALID_INPUT" }, 404);
  const [, jobId, action] = match;
  if (!(await hasValidInternalToken(request, env, jobId, action))) return json({ code: "INVALID_INPUT" }, 401);
  const record = await getInternalRecord(env, jobId);
  if (!record || isExpired(record)) return json({ code: "JOB_EXPIRED" }, 410);
  if (action === "input" && request.method === "GET") {
    const object = await env.TEMP_FILES.get(record.inputKey);
    if (!object) return json({ code: "CORRUPT_FILE" }, 404);
    const headers = new Headers();
    headers.set("Content-Type", record.inputMime);
    headers.set("Content-Length", String(object.size));
    headers.set("Cache-Control", "no-store");
    return new Response(object.body as unknown as BodyInit, { headers });
  }
  if (action === "output" && (request.method === "PUT" || request.method === "DELETE")) {
    if (request.method === "DELETE") {
      await env.TEMP_FILES.delete(record.outputKey);
      return json({ ok: true });
    }
    const contentLength = Number(request.headers.get("Content-Length") ?? "0");
    if (!request.body || !Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > getLimits(record.toolId).maxOutputBytes) return json({ code: "RESOURCE_LIMIT" }, 413);
    await updateJob(env, jobId, { status: "verifying", progress: 0.9 });
    await env.TEMP_FILES.put(record.outputKey, request.body as never, { httpMetadata: { contentType: SERVER_TOOL_OUTPUTS[record.toolId].mime } });
    return json({ ok: true }, 201);
  }
  if (action === "progress" && request.method === "POST") {
    const value = await parseJsonBody(request, 8 * 1024).catch(() => undefined);
    if (!isRecord(value)) return json({ code: "INVALID_INPUT" }, 400);
    const progress = Number(value.progress);
    const phase = typeof value.phase === "string" ? value.phase : "processing";
    const allowedPhase = ["validating", "processing", "verifying"].includes(phase) ? phase as ServerJobStatus : "processing";
    await updateJob(env, jobId, { status: allowedPhase, progress: Number.isFinite(progress) ? Math.min(0.9, Math.max(0, progress)) : undefined });
    return json({ ok: true });
  }
  return json({ code: "INVALID_INPUT" }, 405);
};

const handleFetch = async (request: Request, env: WorkerEnv, ctx: WorkerExecutionContext) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/internal/")) return handleInternal(request, env, url.pathname);
  if (request.method === "POST" && url.pathname === "/v1/jobs") return createJob(request, env);
  const jobMatch = url.pathname.match(/^\/v1\/jobs\/([a-f0-9]{32})(?:\/(input|download))?$/);
  const jobId = jobMatch?.[1];
  const action = jobMatch?.[2];
  if (jobId && action === "input" && request.method === "PUT") return uploadInput(request, env, jobId);
  if (jobId && action === "download" && request.method === "GET") return handleDownload(request, env, ctx, jobId);
  if (jobId && !action && request.method === "GET") return handleStatus(request, env, jobId);
  if (jobId && !action && request.method === "DELETE") return handleCancel(request, env, jobId);
  return json({ code: "INVALID_INPUT" }, 404);
};

export default { fetch: handleFetch, queue: handleQueue };
