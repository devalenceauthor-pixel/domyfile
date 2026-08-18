import { describe, expect, it, vi } from "vitest";
import { ServerFallbackClient } from "./client";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

describe("ServerFallbackClient", () => {
  it("creates, uploads, polls, and downloads a validated PDF result without sending a filename", async () => {
    const jobId = "a".repeat(32);
    const outputBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/v1/jobs") && init?.method === "POST") {
        const requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(requestBody).not.toHaveProperty("filename");
        expect(requestBody).toMatchObject({ toolId: "PDF-01", inputBytes: 100, inputMime: "application/pdf" });
        return jsonResponse({
          jobId,
          accessToken: "temporary-access-token",
          uploadUrl: "https://upload.example.test/input",
          expiresAt: "2026-08-18T00:15:00.000Z",
        }, 201);
      }

      if (url === "https://upload.example.test/input" && init?.method === "PUT") {
        expect(init.headers).toMatchObject({ Authorization: "Bearer temporary-access-token", "Content-Type": "application/pdf" });
        expect(init.body).toBeInstanceOf(File);
        return new Response(null, { status: 202 });
      }

      if (url.endsWith(`/v1/jobs/${jobId}`) && !init?.method) {
        return jsonResponse({
          jobId,
          status: "ready",
          expiresAt: "2026-08-18T00:15:00.000Z",
          result: {
            inputBytes: 100,
            outputBytes: 40,
            savingsPercent: 60,
            outputMime: "application/pdf",
            outputFormat: "PDF",
            pageCount: 3,
            textPagesPreserved: 3,
          },
        });
      }

      if (url.endsWith(`/v1/jobs/${jobId}/download`)) {
        return new Response(new Blob([outputBytes], { type: "application/pdf" }), {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const input = new File([new Uint8Array(100)], "source.pdf", { type: "application/pdf" });
    const statuses: string[] = [];
    const client = new ServerFallbackClient("/__server-fallback", { fetchImpl, pollDelayMs: 0 });
    const result = await client.process({
      toolId: "PDF-01",
      file: input,
      inputMime: "application/pdf",
      options: { preset: "balanced" },
      outputName: "compressed-document.pdf",
      onStatus: (status) => statuses.push(status.status),
    });

    expect(statuses).toEqual(["created", "queued", "ready"]);
    expect(result.jobId).toBe(jobId);
    expect(result.output.name).toBe("compressed-document.pdf");
    expect(result.output.type).toBe("application/pdf");
    expect(result.output.size).toBe(outputBytes.byteLength);
    expect(result.savingsPercent).toBe(60);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
