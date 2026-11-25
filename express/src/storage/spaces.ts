import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

export interface SpacesConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function getSpacesConfig(): SpacesConfig | null {
  const endpoint = process.env["DO_SPACES_ENDPOINT"]?.trim();
  const region = process.env["DO_SPACES_REGION"]?.trim() || "tor1";
  const bucket = process.env["DO_SPACES_BUCKET"]?.trim();
  const accessKeyId = process.env["DO_SPACES_ACCESS_KEY"]?.trim();
  const secretAccessKey = process.env["DO_SPACES_SECRET_KEY"]?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

export function createSpacesClient(config: SpacesConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: false,
  });
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._@-]/g, "_");
}

export function getPortfolioObjectKey(userId: string): string {
  return `users/${sanitizeSegment(userId)}/portfolio.json`;
}


async function streamToString(body: unknown): Promise<string> {
  if (!body) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf-8");
  }
  if (typeof (body as { transformToString?: () => Promise<string> }).transformToString === "function") {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf-8");
  }
  return "";
}

export async function uploadTextObject(
  key: string,
  content: string,
  contentType: string,
  client?: S3Client,
  config?: SpacesConfig | null,
): Promise<void> {
  const resolvedConfig = config ?? getSpacesConfig();
  if (!resolvedConfig) {
    throw new Error("DigitalOcean Spaces configuration is incomplete");
  }
  const resolvedClient = client ?? createSpacesClient(resolvedConfig);

  await resolvedClient.send(
    new PutObjectCommand({
      Bucket: resolvedConfig.bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
    }),
  );
}

export async function downloadTextObject(
  key: string,
  client?: S3Client,
  config?: SpacesConfig | null,
): Promise<string | null> {
  const resolvedConfig = config ?? getSpacesConfig();
  if (!resolvedConfig) {
    throw new Error("DigitalOcean Spaces configuration is incomplete");
  }
  const resolvedClient = client ?? createSpacesClient(resolvedConfig);

  try {
    const response = await resolvedClient.send(
      new GetObjectCommand({
        Bucket: resolvedConfig.bucket,
        Key: key,
      }),
    );
    return await streamToString(response.Body);
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

export async function deleteObject(
  key: string,
  client?: S3Client,
  config?: SpacesConfig | null,
): Promise<void> {
  const resolvedConfig = config ?? getSpacesConfig();
  if (!resolvedConfig) {
    throw new Error("DigitalOcean Spaces configuration is incomplete");
  }
  const resolvedClient = client ?? createSpacesClient(resolvedConfig);

  await resolvedClient.send(
    new DeleteObjectCommand({
      Bucket: resolvedConfig.bucket,
      Key: key,
    }),
  );
}

export function getWatchLogoObjectKey(
  userId: string,
  watchId: number,
  extension: string,
): string {
  const safeExt = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "png";
  return `logos/${sanitizeSegment(userId)}/watch-${watchId}-${Date.now()}.${safeExt}`;
}

export async function uploadBinaryObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  client?: S3Client,
  config?: SpacesConfig | null,
): Promise<string> {
  const resolvedConfig = config ?? getSpacesConfig();
  if (!resolvedConfig) {
    throw new Error("DigitalOcean Spaces configuration is incomplete");
  }
  const resolvedClient = client ?? createSpacesClient(resolvedConfig);

  await resolvedClient.send(
    new PutObjectCommand({
      Bucket: resolvedConfig.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return key;
}

export async function downloadBinaryObject(
  key: string,
  client?: S3Client,
  config?: SpacesConfig | null,
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  const resolvedConfig = config ?? getSpacesConfig();
  if (!resolvedConfig) {
    throw new Error("DigitalOcean Spaces configuration is incomplete");
  }
  const resolvedClient = client ?? createSpacesClient(resolvedConfig);

  try {
    const response = await resolvedClient.send(
      new GetObjectCommand({
        Bucket: resolvedConfig.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      return null;
    }

    const bytes =
      typeof (response.Body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray ===
      "function"
        ? await (response.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray()
        : new Uint8Array(await new Response(response.Body as Readable).arrayBuffer());

    return {
      body: bytes,
      contentType: response.ContentType,
    };
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}