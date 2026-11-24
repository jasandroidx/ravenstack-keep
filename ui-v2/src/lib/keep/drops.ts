import fs from "node:fs";
import path from "node:path";

export interface RavenDropInfo {
  exists: boolean;
  filename: string;
  mtime: string;
  header: string;
  content: string;
}

const MAX_BYTES = 12 * 1024; // 12KB cap

export function getDropsDir(): string {
  return process.env.KEEP_DROPS_DIR?.trim() || "/root/obsidian_vault/Ravenstack/ops/drops";
}

/**
 * Reads the latest Raven Drop from KEEP_DROPS_DIR/latest.txt.
 * Strictly accesses latest.txt only. Caps content at 12KB while preserving the header line.
 */
export function readLatestRavenDrop(): RavenDropInfo {
  const dropsDir = getDropsDir();
  const filePath = path.join(dropsDir, "latest.txt");

  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      filename: "latest.txt",
      mtime: "",
      header: "",
      content: "",
    };
  }

  try {
    const stats = fs.statSync(filePath);
    const mtime = stats.mtime.toISOString();
    const fileSize = stats.size;

    if (fileSize <= MAX_BYTES) {
      const fullContent = fs.readFileSync(filePath, "utf-8");
      const firstLineEnd = fullContent.indexOf("\n");
      const header = firstLineEnd !== -1 ? fullContent.slice(0, firstLineEnd).trim() : fullContent.trim();
      return {
        exists: true,
        filename: "latest.txt",
        mtime,
        header,
        content: fullContent,
      };
    }

    // Larger than 12KB: preserve header line and tail the remaining 12KB budget
    const fd = fs.openSync(filePath, "r");

    const headerBuf = Buffer.alloc(Math.min(fileSize, 2048));
    const bytesReadHeader = fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
    const headerStr = headerBuf.toString("utf-8", 0, bytesReadHeader);
    const firstLineEnd = headerStr.indexOf("\n");
    const header = firstLineEnd !== -1 ? headerStr.slice(0, firstLineEnd).trim() : headerStr.trim();
    const headerLine = firstLineEnd !== -1 ? headerStr.slice(0, firstLineEnd + 1) : headerStr + "\n";

    const truncationNotice = "\n...[truncated]...\n";
    const headerBytesLen = Buffer.byteLength(headerLine, "utf-8");
    const noticeBytesLen = Buffer.byteLength(truncationNotice, "utf-8");
    const tailBytesToRead = Math.max(0, MAX_BYTES - headerBytesLen - noticeBytesLen);

    const tailBuf = Buffer.alloc(tailBytesToRead);
    const tailStartPos = Math.max(0, fileSize - tailBytesToRead);
    const bytesReadTail = fs.readSync(fd, tailBuf, 0, tailBytesToRead, tailStartPos);
    fs.closeSync(fd);

    const tailStr = tailBuf.toString("utf-8", 0, bytesReadTail);
    const content = headerLine + truncationNotice + tailStr;

    return {
      exists: true,
      filename: "latest.txt",
      mtime,
      header,
      content,
    };
  } catch (err) {
    console.warn("Failed to read latest.txt Raven Drop:", err);
    return {
      exists: false,
      filename: "latest.txt",
      mtime: "",
      header: "",
      content: "",
    };
  }
}
