import { asPdfProcessingError } from "../tools/engines/pdf/errors";
import { runPdfOperation, type PdfOperationInput } from "../tools/engines/pdf/pdf-operations";
import type { PdfWorkerMessage, PdfWorkerRequest, PdfWorkerResponse } from "../tools/engines/pdf/worker-protocol";

const workerScope = globalThis as unknown as {
  addEventListener: (type: string, listener: (event: MessageEvent<PdfWorkerMessage>) => void) => void;
  postMessage: (message: PdfWorkerResponse, transfer?: Transferable[]) => void;
};

const cancelled = new Set<number>();

const toTransferableBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
};

const processRequest = async (request: PdfWorkerRequest) => {
  try {
    const inputs: PdfOperationInput[] = request.inputs.map((input) => ({
      name: input.name,
      mime: input.mime,
      bytes: new Uint8Array(input.buffer),
    }));
    const watermarkImage = request.watermarkImage
      ? { name: request.watermarkImage.name, mime: request.watermarkImage.mime, bytes: new Uint8Array(request.watermarkImage.buffer) }
      : undefined;
    if (cancelled.has(request.id)) return;
    const outputs = await runPdfOperation(request.tool, inputs, request.options, watermarkImage);
    if (cancelled.has(request.id)) return;
    const outputPayload = outputs.map((output) => ({
      buffer: toTransferableBuffer(output.bytes),
      pageCount: output.pageCount,
      pageNumber: output.pageNumber,
    }));
    const transferables = outputPayload.map((output) => output.buffer);
    workerScope.postMessage({
      type: "success",
      id: request.id,
      outputs: outputPayload,
    }, transferables);
  } catch (error) {
    const typedError = asPdfProcessingError(error);
    workerScope.postMessage({ type: "error", id: request.id, code: typedError.code === "ENCRYPTED_PDF_UNSUPPORTED" ? typedError.code : typedError.code === "CORRUPT_FILE" ? typedError.code : typedError.code === "OUT_OF_MEMORY_RISK" ? typedError.code : "PROCESSING_FAILED", message: typedError.userMessage });
  } finally {
    cancelled.delete(request.id);
  }
};

workerScope.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelled.add(message.id);
    return;
  }
  void processRequest(message);
});
