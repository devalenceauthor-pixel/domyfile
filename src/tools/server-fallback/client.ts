import { ServerFallbackError } from "./errors";
import type {
  ServerJobOptions,
  ServerJobResult,
  ServerJobStatus,
  ServerJobStatusResponse,
  ServerToolId,
} from "./types";

type FetchLike = typeof fetch;

type CreatedJob = {
  jobId: string;
  accessToken: string;
  uploadUrl: string;
  expiresAt: string;
};

export type ServerClientResult = ServerJobResult & {
  jobId: string;
  output: File;
};

const terminalStatuses = new Set<ServerJobStatus>(["ready", "error", "cancelled", "expired"]);

const asJson = async <T>(response: Response) => {
  try {
    return await response.json() as T;
  } catch {
    return undefined;
  }
};

const joinUrl = (baseUrl: string, path: string) => `${baseUrl.replace(/\/$/, "")}${path}`;

export class ServerFallbackClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly pollDelayMs: number;

  constructor(baseUrl: string, options: { fetchImpl?: FetchLike; pollDelayMs?: number } = {}) {
    this.baseUrl = baseUrl || "/__server-fallback";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollDelayMs = options.pollDelayMs ?? 750;
  }

  private authorization(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  async create(toolId: ServerToolId, inputBytes: number, inputMime: string, options: ServerJobOptions, signal?: AbortSignal): Promise<CreatedJob> {
    const response = await this.fetchImpl(joinUrl(this.baseUrl, "/v1/jobs"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId, inputBytes, inputMime, options }),
      signal,
    });
    const body = await asJson<{ jobId?: string; accessToken?: string; uploadUrl?: string; expiresAt?: string; code?: string }>(response);
    if (!response.ok || !body?.jobId || !body.accessToken || !body.uploadUrl || !body.expiresAt) {
      throw new ServerFallbackError(response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "SERVER_UNAVAILABLE" : "INVALID_INPUT");
    }
    return body as CreatedJob;
  }

  async upload(job: CreatedJob, file: File, inputMime: string, signal?: AbortSignal) {
    const response = await this.fetchImpl(job.uploadUrl, {
      method: "PUT",
      headers: { ...this.authorization(job.accessToken), "Content-Type": inputMime },
      body: file,
      signal,
    });
    if (!response.ok) {
      const body = await asJson<{ code?: string }>(response);
      throw new ServerFallbackError(body?.code === "RESOURCE_LIMIT" ? "RESOURCE_LIMIT" : body?.code === "UNSUPPORTED_FORMAT" ? "UNSUPPORTED_FORMAT" : "UPLOAD_FAILED");
    }
  }

  async status(job: CreatedJob, signal?: AbortSignal): Promise<ServerJobStatusResponse> {
    const response = await this.fetchImpl(joinUrl(this.baseUrl, `/v1/jobs/${encodeURIComponent(job.jobId)}`), {
      headers: this.authorization(job.accessToken),
      signal,
    });
    const body = await asJson<ServerJobStatusResponse & { code?: string }>(response);
    if (!response.ok || !body?.status) {
      throw new ServerFallbackError(response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "SERVER_UNAVAILABLE" : "PROCESSING_FAILED");
    }
    return body;
  }

  async waitForCompletion(job: CreatedJob, signal?: AbortSignal, onStatus?: (status: ServerJobStatusResponse) => void) {
    while (true) {
      const status = await this.status(job, signal);
      onStatus?.(status);
      if (terminalStatuses.has(status.status)) return status;
      await new Promise<void>((resolve, reject) => {
        function abort() {
          globalThis.clearTimeout(timeout);
          signal?.removeEventListener("abort", abort);
          reject(new ServerFallbackError("CANCELLED"));
        }
        const timeout = globalThis.setTimeout(() => {
          signal?.removeEventListener("abort", abort);
          resolve();
        }, this.pollDelayMs);
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
  }

  async download(job: CreatedJob, signal?: AbortSignal) {
    const response = await this.fetchImpl(joinUrl(this.baseUrl, `/v1/jobs/${encodeURIComponent(job.jobId)}/download`), {
      headers: this.authorization(job.accessToken),
      signal,
    });
    if (!response.ok) {
      const body = await asJson<{ code?: string }>(response);
      throw new ServerFallbackError(body?.code === "JOB_EXPIRED" ? "JOB_EXPIRED" : body?.code === "OUTPUT_INVALID" ? "OUTPUT_INVALID" : "SERVER_UNAVAILABLE");
    }
    return response.blob();
  }

  async cancel(job: CreatedJob) {
    await this.fetchImpl(joinUrl(this.baseUrl, `/v1/jobs/${encodeURIComponent(job.jobId)}`), {
      method: "DELETE",
      headers: this.authorization(job.accessToken),
    }).catch(() => undefined);
  }

  async process(params: {
    toolId: ServerToolId;
    file: File;
    inputMime: string;
    options: ServerJobOptions;
    outputName: string;
    signal?: AbortSignal;
    onStatus?: (status: ServerJobStatusResponse) => void;
  }): Promise<ServerClientResult> {
    let job: CreatedJob | undefined;
    const cancelOnAbort = () => {
      if (job) void this.cancel(job);
    };
    params.signal?.addEventListener("abort", cancelOnAbort, { once: true });
    try {
      job = await this.create(params.toolId, params.file.size, params.inputMime, params.options, params.signal);
      params.onStatus?.({ jobId: job.jobId, status: "created", expiresAt: job.expiresAt });
      await this.upload(job, params.file, params.inputMime, params.signal);
      params.onStatus?.({ jobId: job.jobId, status: "queued", expiresAt: job.expiresAt });
      const finalStatus = await this.waitForCompletion(job, params.signal, params.onStatus);
      if (finalStatus.status !== "ready" || !finalStatus.result) {
        throw new ServerFallbackError(finalStatus.code ?? (finalStatus.status === "expired" ? "JOB_EXPIRED" : finalStatus.status === "cancelled" ? "CANCELLED" : "PROCESSING_FAILED"));
      }
      const output = await this.download(job, params.signal);
      return { ...finalStatus.result, jobId: job.jobId, output: new File([output], params.outputName, { type: finalStatus.result.outputMime }) };
    } catch (error) {
      if (params.signal?.aborted) throw new ServerFallbackError("CANCELLED");
      if (error instanceof ServerFallbackError) throw error;
      throw new ServerFallbackError("SERVER_UNAVAILABLE");
    } finally {
      params.signal?.removeEventListener("abort", cancelOnAbort);
    }
  }
}
