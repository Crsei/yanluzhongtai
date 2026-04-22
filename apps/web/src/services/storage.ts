import { api } from "./http";

export type StorageFolder = "employees/attachments" | "employees/import-batches";

export const storageApi = {
  signUpload: (folder: StorageFolder, filename: string, contentType: string) =>
    api.post<{ key: string; putUrl: string; contentType: string }>(
      "/storage/uploads/sign",
      { folder, filename, contentType },
    ),
  signDownload: (key: string) =>
    api.get<{ url: string }>(
      `/storage/downloads/sign?key=${encodeURIComponent(key)}`,
    ),
};

/** Sign a presigned PUT URL and upload the File directly to MinIO. */
export async function uploadToStorage(folder: StorageFolder, file: File): Promise<string> {
  const { key, putUrl } = await storageApi.signUpload(
    folder,
    file.name,
    file.type || "application/octet-stream",
  );
  const res = await fetch(putUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!res.ok) {
    throw new Error(`文件上传失败 (${res.status})`);
  }
  return key;
}
