export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readRequestTextWithinLimit(
  request: Request,
  maxBytes: number
): Promise<string> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new Error("maxBytes must be a positive integer");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (bytesRead + value.byteLength > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError(maxBytes);
    }
    chunks.push(value);
    bytesRead += value.byteLength;
  }

  const body = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}
