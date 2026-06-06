import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").slice(0, 120);
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: MinioClient;
  private publicClient: MinioClient | null = null;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const endPoint = this.config.getOrThrow<string>("MINIO_ENDPOINT");
    const port = Number(this.config.get<string>("MINIO_PORT", "9000"));
    const useSSL = this.config.get<string>("MINIO_USE_SSL", "false") === "true";
    const accessKey = this.config.getOrThrow<string>("MINIO_ACCESS_KEY");
    const secretKey = this.config.getOrThrow<string>("MINIO_SECRET_KEY");

    this.client = new MinioClient({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    const publicEndpoint = this.config.get<string>("MINIO_PUBLIC_ENDPOINT");
    if (publicEndpoint) {
      const url = new URL(
        publicEndpoint.startsWith("http") ? publicEndpoint : `http://${publicEndpoint}`,
      );
      this.publicClient = new MinioClient({
        endPoint: url.hostname,
        port: Number(url.port || (url.protocol === "https:" ? "443" : "80")),
        useSSL: url.protocol === "https:",
        accessKey,
        secretKey,
      });
      this.logger.log(`MinIO public endpoint configured: ${publicEndpoint}`);
    }

    this.bucket = this.config.getOrThrow<string>("MINIO_BUCKET");

    const exists = await this.client.bucketExists(this.bucket).catch((err: unknown) => {
      this.logger.warn(`bucketExists check failed, will attempt makeBucket: ${err}`);
      return false;
    });
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created MinIO bucket "${this.bucket}"`);
    }

    try {
      await this.client.setBucketPolicy(
        this.bucket,
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: ["*"] },
              Action: ["s3:GetObject", "s3:PutObject"],
              Resource: [`arn:aws:s3:::${this.bucket}/*`],
            },
          ],
        }),
      );
      this.logger.log(`MinIO bucket "${this.bucket}" anonymous read/write policy configured`);
    } catch (err: unknown) {
      this.logger.warn(`Failed to set bucket policy on "${this.bucket}": ${err}`);
    }
  }

  private presignClient(): MinioClient {
    return this.publicClient ?? this.client;
  }

  async signUpload(folder: string, originalName: string, contentType: string) {
    const key = `${folder}/${randomUUID()}-${sanitizeFilename(originalName)}`;
    const putUrl = await this.presignClient().presignedPutObject(this.bucket, key, 60 * 5);
    return { key, putUrl, contentType };
  }

  async signDownload(key: string, ttlSeconds = 60 * 10): Promise<string> {
    return this.presignClient().presignedGetObject(this.bucket, key, ttlSeconds);
  }

  async readObject(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }
}
