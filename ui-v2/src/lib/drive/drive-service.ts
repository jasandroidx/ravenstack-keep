export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
  owners?: Array<{
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  }>;
  shared?: boolean;
  starred?: boolean;
  trashed?: boolean;
  description?: string;
}

export interface DriveStorageQuota {
  limit?: string;
  usage?: string;
  usageInDrive?: string;
  usageInDriveTrash?: string;
}

export interface DriveAbout {
  user?: {
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  };
  storageQuota?: DriveStorageQuota;
}

export interface ListFilesResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_API_BASE = "https://www.googleapis.com/upload/drive/v3";

/**
 * Fetch Google Drive storage quota and user profile info
 */
export async function getDriveAbout(accessToken: string): Promise<DriveAbout> {
  const res = await fetch(`${DRIVE_API_BASE}/about?fields=user,storageQuota`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch Drive information (${res.status})`);
  }

  return res.json();
}

/**
 * List files and folders with optional search and folder navigation
 */
export async function listDriveFiles(
  accessToken: string,
  options: {
    folderId?: string;
    searchQuery?: string;
    mimeCategory?: string;
    pageSize?: number;
    pageToken?: string;
    orderBy?: string;
    includeTrashed?: boolean;
  } = {},
): Promise<ListFilesResponse> {
  const params = new URLSearchParams();
  params.set(
    "fields",
    "nextPageToken, files(id, name, mimeType, modifiedTime, size, iconLink, thumbnailLink, webViewLink, webContentLink, parents, owners, shared, starred, trashed, description)",
  );
  params.set("pageSize", String(options.pageSize || 50));
  params.set("orderBy", options.orderBy || "folder,modifiedTime desc");

  if (options.pageToken) {
    params.set("pageToken", options.pageToken);
  }

  const queryParts: string[] = [];

  if (options.includeTrashed) {
    queryParts.push("trashed = true");
  } else {
    queryParts.push("trashed = false");
  }

  if (options.folderId && !options.searchQuery) {
    queryParts.push(`'${options.folderId}' in parents`);
  } else if (!options.searchQuery && !options.includeTrashed) {
    // If no specific folder, show root or all non-trashed
    queryParts.push(`'root' in parents`);
  }

  if (options.searchQuery) {
    const safeQuery = options.searchQuery.replace(/'/g, "\\'");
    queryParts.push(`name contains '${safeQuery}' or fullText contains '${safeQuery}'`);
  }

  if (options.mimeCategory && options.mimeCategory !== "all") {
    switch (options.mimeCategory) {
      case "folder":
        queryParts.push("mimeType = 'application/vnd.google-apps.folder'");
        break;
      case "document":
        queryParts.push(
          "(mimeType = 'application/vnd.google-apps.document' or mimeType contains 'text/' or mimeType = 'application/pdf' or mimeType contains 'msword' or mimeType contains 'wordprocessingml')",
        );
        break;
      case "spreadsheet":
        queryParts.push(
          "(mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType contains 'sheet' or mimeType contains 'excel' or mimeType = 'text/csv')",
        );
        break;
      case "presentation":
        queryParts.push(
          "(mimeType = 'application/vnd.google-apps.presentation' or mimeType contains 'presentation' or mimeType contains 'powerpoint')",
        );
        break;
      case "image":
        queryParts.push("mimeType contains 'image/'");
        break;
      case "audio":
        queryParts.push("mimeType contains 'audio/'");
        break;
      case "video":
        queryParts.push("mimeType contains 'video/'");
        break;
      case "code":
        queryParts.push(
          "(mimeType contains 'json' or mimeType contains 'javascript' or mimeType contains 'typescript' or mimeType contains 'python' or mimeType contains 'html' or mimeType contains 'xml' or mimeType contains 'yaml')",
        );
        break;
    }
  }

  if (queryParts.length > 0) {
    params.set("q", queryParts.join(" and "));
  }

  const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to list Drive files (${res.status})`);
  }

  return res.json();
}

/**
 * Fetch file details
 */
export async function getDriveFile(accessToken: string, fileId: string): Promise<DriveFile> {
  const res = await fetch(
    `${DRIVE_API_BASE}/files/${fileId}?fields=id,name,mimeType,modifiedTime,size,iconLink,thumbnailLink,webViewLink,webContentLink,parents,owners,shared,starred,trashed,description`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to get file details (${res.status})`);
  }

  return res.json();
}

/**
 * Fetch or export text content of a file
 */
export async function getFileContent(
  accessToken: string,
  fileId: string,
  mimeType: string,
): Promise<{ text: string; isBinary: boolean; url?: string }> {
  // Google Docs format -> export as text/plain or markdown
  if (mimeType === "application/vnd.google-apps.document") {
    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}/export?mimeType=text/plain`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Could not export document content (${res.status})`);
    const text = await res.text();
    return { text, isBinary: false };
  }

  // Google Sheets -> export as text/csv
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}/export?mimeType=text/csv`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Could not export spreadsheet content (${res.status})`);
    const text = await res.text();
    return { text, isBinary: false };
  }

  // Google Presentations -> export as plain text
  if (mimeType === "application/vnd.google-apps.presentation") {
    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}/export?mimeType=text/plain`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Could not export presentation content (${res.status})`);
    const text = await res.text();
    return { text, isBinary: false };
  }

  // Regular plain text, json, markdown, yaml, code files
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.includes("xml") ||
    mimeType.includes("yaml") ||
    mimeType.includes("csv") ||
    mimeType.includes("markdown")
  ) {
    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Could not read file content (${res.status})`);
    const text = await res.text();
    return { text, isBinary: false };
  }

  // Binary files (PDF, images, etc.)
  return {
    text: "",
    isBinary: true,
  };
}

/**
 * Create a new Folder in Google Drive
 */
export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentFolderId?: string,
): Promise<DriveFile> {
  const body: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentFolderId && parentFolderId !== "root") {
    body.parents = [parentFolderId];
  }

  const res = await fetch(`${DRIVE_API_BASE}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create folder (${res.status})`);
  }

  return res.json();
}

/**
 * Create a new Text or Markdown Note file directly in Drive
 */
export async function createDriveTextFile(
  accessToken: string,
  name: string,
  content: string,
  parentFolderId?: string,
  mimeType: string = "text/markdown",
): Promise<DriveFile> {
  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType,
  };
  if (parentFolderId && parentFolderId !== "root") {
    metadata.parents = [parentFolderId];
  }

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n` +
    content +
    closeDelimiter;

  const res = await fetch(`${UPLOAD_API_BASE}/files?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create file (${res.status})`);
  }

  return res.json();
}

/**
 * Upload a binary or document file from browser to Drive
 */
export async function uploadFileToDrive(
  accessToken: string,
  file: File,
  parentFolderId?: string,
): Promise<DriveFile> {
  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
  };
  if (parentFolderId && parentFolderId !== "root") {
    metadata.parents = [parentFolderId];
  }

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const fileData = await file.arrayBuffer();
  const metaHeader =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`;

  const metaHeaderBuffer = new TextEncoder().encode(metaHeader);
  const closeDelimiterBuffer = new TextEncoder().encode(closeDelimiter);

  const combinedLength = metaHeaderBuffer.length + fileData.byteLength + closeDelimiterBuffer.length;
  const combinedBuffer = new Uint8Array(combinedLength);

  combinedBuffer.set(metaHeaderBuffer, 0);
  combinedBuffer.set(new Uint8Array(fileData), metaHeaderBuffer.length);
  combinedBuffer.set(closeDelimiterBuffer, metaHeaderBuffer.length + fileData.byteLength);

  const res = await fetch(`${UPLOAD_API_BASE}/files?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: combinedBuffer,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to upload file (${res.status})`);
  }

  return res.json();
}

/**
 * Trash a file (Moves to Drive Trash)
 */
export async function trashDriveFile(accessToken: string, fileId: string): Promise<DriveFile> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trashed: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to move file to trash (${res.status})`);
  }

  return res.json();
}

/**
 * Permanently delete a file from Drive (Irreversible)
 */
export async function deleteDriveFilePermanently(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to permanently delete file (${res.status})`);
  }
}

/**
 * Rename a Drive file
 */
export async function renameDriveFile(
  accessToken: string,
  fileId: string,
  newName: string,
): Promise<DriveFile> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: newName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to rename file (${res.status})`);
  }

  return res.json();
}

/**
 * Format bytes to readable size
 */
export function formatBytes(bytes?: number | string): string {
  if (bytes === undefined || bytes === null || bytes === "") return "—";
  const num = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(num) || num <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  return `${(num / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Helper to identify MIME type category and return color + label
 */
export function getMimeInfo(mimeType: string): { label: string; color: string; isFolder: boolean } {
  if (mimeType === "application/vnd.google-apps.folder") {
    return { label: "Folder", color: "#ffc857", isFolder: true };
  }
  if (mimeType === "application/vnd.google-apps.document") {
    return { label: "Google Doc", color: "#4285F4", isFolder: false };
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    return { label: "Google Sheet", color: "#0F9D58", isFolder: false };
  }
  if (mimeType === "application/vnd.google-apps.presentation") {
    return { label: "Google Slides", color: "#F4B400", isFolder: false };
  }
  if (mimeType === "application/pdf") {
    return { label: "PDF Document", color: "#EA4335", isFolder: false };
  }
  if (mimeType.startsWith("image/")) {
    return { label: "Image", color: "#2de2e6", isFolder: false };
  }
  if (mimeType.startsWith("audio/")) {
    return { label: "Audio", color: "#ff2a6d", isFolder: false };
  }
  if (mimeType.startsWith("video/")) {
    return { label: "Video", color: "#a855f7", isFolder: false };
  }
  if (
    mimeType.includes("json") ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.includes("python") ||
    mimeType.includes("markdown") ||
    mimeType.includes("yaml") ||
    mimeType.startsWith("text/")
  ) {
    return { label: "Code / Text", color: "#39ff14", isFolder: false };
  }
  return { label: "File", color: "#94a3b8", isFolder: false };
}
