import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";

/** Strip path traversal characters, keep CJK/ASCII alphanumerics, '-', '_', '.', spaces */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").slice(0, 120);
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: MinioClient;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.client = new MinioClient({
      endPoint: this.config.getOrThrow<string>("MINIO_ENDPOINT"),
      port: Number(this.config.get<string>("MINIO_PORT", "9000")),
      useSSL: this.config.get<string>("MINIO_USE_SSL", "false") === "true",
      accessKey: this.config.getOrThrow<string>("MINIO_ACCESS_KEY"),
      secretKey: this.config.getOrThrow<string>("MINIO_SECRET_KEY"),
    });
    this.bucket = this.config.getOrThrow<string>("MINIO_BUCKET");

    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created MinIO bucket "${this.bucket}"`);
    }
  }

  async signUpload(folder: string, originalName: string, contentType: string) {
    const key = `${folder}/${randomUUID()}-${sanitizeFilename(originalName)}`;
    const putUrl = await this.client.presignedPutObject(this.bucket, key, 60 * 5);
    return { key, putUrl, contentType };
  }

  async signDownload(key: string, ttlSeconds = 60 * 10): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, ttlSeconds);
  }

  /** Stream object as Buffer; used by Excel import service to fetch uploaded files. */
  async readObject(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }
}
