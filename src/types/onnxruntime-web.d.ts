declare module "onnxruntime-web" {
  export const env: {
    wasm: {
      numThreads: number;
      proxy: boolean;
    };
  };

  export class Tensor {
    constructor(type: string, data: unknown, dims: readonly number[]);
    dispose(): void;
  }

  export type InferenceSession = {
    outputNames: string[];
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor & {
      dims: readonly number[];
      getData(copy?: boolean): Promise<Float32Array>;
    }>>;
    release(): Promise<void>;
  };

  export const InferenceSession: {
    create(modelPath: string, options?: Record<string, unknown>): Promise<InferenceSession>;
  };
}
