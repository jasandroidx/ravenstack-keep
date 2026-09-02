import React, { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Folder,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileCode,
  Image as ImageIcon,
  File as FileGeneric,
  Trash2,
  Upload,
  Plus,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  HardDrive,
  Eye,
  AlertTriangle,
  FolderPlus,
  BookOpen,
} from "lucide-react";
import { useGoogleDriveAuth } from "@/lib/drive/google-auth";
import {
  listDriveFiles,
  getDriveAbout,
  getFileContent,
  createDriveFolder,
  createDriveTextFile,
  uploadFileToDrive,
  trashDriveFile,
  deleteDriveFilePermanently,
  renameDriveFile,
  formatBytes,
  getMimeInfo,
  type DriveFile,
  type DriveAbout,
} from "@/lib/drive/drive-service";
import { Button } from "@/components/ui/button";

interface FolderBreadcrumb {
  id: string;
  name: string;
}

export function GoogleDriveExplorer() {
  const { user, token, isAuthenticated, loading: authLoading, signIn, signOut } = useGoogleDriveAuth();

  const [files, setFiles] = useState<DriveFile[]>([]);
  const [about, setAbout] = useState<DriveAbout | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [breadcrumbs, setBreadcrumbs] = useState<FolderBreadcrumb[]>([{ id: "root", name: "My Drive" }]);
  const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.id || "root";

  // Selected file for preview / details
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Destructive action confirmation modal state (MANDATORY per Workspace Skill)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionLabel: string;
    onConfirm: () => Promise<void>;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    actionLabel: "",
    onConfirm: async () => {},
  });

  // New folder dialog
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // New doc dialog
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocContent, setNewDocContent] = useState("");

  // Rename dialog
  const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Drag-and-drop upload state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ingest to Oracle Knowledge
  const [ingestedFiles, setIngestedFiles] = useState<Set<string>>(new Set());

  const loadDriveData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [filesRes, aboutRes] = await Promise.all([
        listDriveFiles(token, {
          folderId: currentFolderId,
          searchQuery: searchQuery.trim() || undefined,
          mimeCategory: activeCategory,
          includeTrashed: activeCategory === "trash",
        }),
        getDriveAbout(token).catch((err) => {
          console.warn("Could not fetch storage quota:", err);
          return null;
        }),
      ]);

      setFiles(filesRes.files || []);
      if (aboutRes) setAbout(aboutRes);
    } catch (err) {
      console.error("Failed to load Google Drive files:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load Google Drive files");
    } finally {
      setLoading(false);
    }
  }, [token, currentFolderId, searchQuery, activeCategory]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDriveData();
    }
  }, [isAuthenticated, loadDriveData]);

  // Handle opening file / folder
  const handleItemClick = (file: DriveFile) => {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      setBreadcrumbs((prev) => [...prev, { id: file.id, name: file.name }]);
      setSearchQuery("");
    } else {
      handleOpenFilePreview(file);
    }
  };

  // Preview file content
  const handleOpenFilePreview = async (file: DriveFile) => {
    setSelectedFile(file);
    setPreviewContent(null);
    if (!token) return;

    setPreviewLoading(true);
    try {
      const content = await getFileContent(token, file.id, file.mimeType);
      if (!content.isBinary && content.text) {
        setPreviewContent(content.text);
      } else {
        setPreviewContent(null);
      }
    } catch (err) {
      console.warn("Preview content fetch error:", err);
      setPreviewContent(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Folder breadcrumb navigation
  const navigateToBreadcrumb = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSearchQuery("");
  };

  // Create folder
  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newFolderName.trim()) return;
    try {
      await createDriveFolder(token, newFolderName.trim(), currentFolderId);
      toast.success(`Created folder "${newFolderName.trim()}"`);
      setNewFolderName("");
      setIsCreatingFolder(false);
      loadDriveData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create folder");
    }
  };

  // Create text file
  const handleCreateDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newDocName.trim()) return;
    try {
      const fileName = newDocName.endsWith(".md") || newDocName.endsWith(".txt") ? newDocName : `${newDocName}.md`;
      await createDriveTextFile(token, fileName, newDocContent, currentFolderId);
      toast.success(`Created "${fileName}" in Google Drive`);
      setNewDocName("");
      setNewDocContent("");
      setIsCreatingDoc(false);
      loadDriveData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create file");
    }
  };

  // Rename file
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !renameTarget || !renameValue.trim()) return;
    try {
      await renameDriveFile(token, renameTarget.id, renameValue.trim());
      toast.success(`Renamed to "${renameValue.trim()}"`);
      setRenameTarget(null);
      setRenameValue("");
      loadDriveData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename file");
    }
  };

  // File Upload
  const handleFileUpload = async (uploadFiles: FileList | File[]) => {
    if (!token) return;
    const fileList = Array.from(uploadFiles);
    if (fileList.length === 0) return;

    const toastId = toast.loading(`Uploading ${fileList.length} file(s) to Google Drive…`);
    try {
      for (const file of fileList) {
        await uploadFileToDrive(token, file, currentFolderId);
      }
      toast.success(`Successfully uploaded ${fileList.length} file(s)`, { id: toastId });
      loadDriveData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed", { id: toastId });
    }
  };

  // Move to trash with explicit user confirmation
  const promptTrashFile = (file: DriveFile) => {
    setConfirmModal({
      isOpen: true,
      title: "Move File to Drive Trash?",
      message: `Are you sure you want to move "${file.name}" to Google Drive Trash? You can restore it from the trash tab.`,
      actionLabel: "Move to Trash",
      isDestructive: true,
      onConfirm: async () => {
        if (!token) return;
        try {
          await trashDriveFile(token, file.id);
          toast.success(`Moved "${file.name}" to Trash`);
          if (selectedFile?.id === file.id) setSelectedFile(null);
          loadDriveData();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to trash file");
        }
      },
    });
  };

  // Permanent Delete with explicit confirmation
  const promptPermanentDelete = (file: DriveFile) => {
    setConfirmModal({
      isOpen: true,
      title: "Permanently Delete File?",
      message: `WARNING: This action CANNOT be undone. "${file.name}" will be permanently erased from your Google Drive account.`,
      actionLabel: "Permanently Delete",
      isDestructive: true,
      onConfirm: async () => {
        if (!token) return;
        try {
          await deleteDriveFilePermanently(token, file.id);
          toast.success(`Permanently deleted "${file.name}"`);
          if (selectedFile?.id === file.id) setSelectedFile(null);
          loadDriveData();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Permanent delete failed");
        }
      },
    });
  };

  // Ingest Document into Ravenstack Knowledge
  const handleIngestKnowledge = async (file: DriveFile) => {
    if (!token) return;
    const toastId = toast.loading(`Extracting knowledge from "${file.name}"…`);
    try {
      const content = await getFileContent(token, file.id, file.mimeType);
      const textToSave = content.text || `Reference document: ${file.name} (URL: ${file.webViewLink || "Google Drive"})`;
      
      // Store in session storage / local fortress catalog
      const knowledgeItem = {
        id: `drive-${file.id}`,
        scope: "Google Drive / Vault",
        title: file.name,
        body: textToSave.slice(0, 4000), // Cap reasonable chunk
        sourceUrl: file.webViewLink,
        ingestedAt: new Date().toISOString(),
      };

      const existing = JSON.parse(localStorage.getItem("ravenstack_custom_knowledge") || "[]");
      const updated = [knowledgeItem, ...existing.filter((k: { id: string }) => k.id !== knowledgeItem.id)];
      localStorage.setItem("ravenstack_custom_knowledge", JSON.stringify(updated));

      setIngestedFiles((prev) => new Set([...prev, file.id]));
      toast.success(`Ingested "${file.name}" into Ravenstack Oracle shelf!`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to ingest document", { id: toastId });
    }
  };

  // Drag and drop handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const getFileIcon = (file: DriveFile) => {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      return <Folder className="h-5 w-5 text-amber-400" />;
    }
    if (file.mimeType === "application/vnd.google-apps.document") {
      return <FileText className="h-5 w-5 text-blue-400" />;
    }
    if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
      return <FileSpreadsheet className="h-5 w-5 text-emerald-400" />;
    }
    if (file.mimeType === "application/vnd.google-apps.presentation") {
      return <Presentation className="h-5 w-5 text-amber-500" />;
    }
    if (file.mimeType.startsWith("image/")) {
      return <ImageIcon className="h-5 w-5 text-cyan-400" />;
    }
    if (file.mimeType.includes("json") || file.mimeType.includes("javascript") || file.mimeType.includes("typescript") || file.mimeType.includes("markdown")) {
      return <FileCode className="h-5 w-5 text-green-400" />;
    }
    return <FileGeneric className="h-5 w-5 text-zinc-400" />;
  };

  // Quota calculation
  const quotaLimit = about?.storageQuota?.limit ? parseInt(about.storageQuota.limit, 10) : 0;
  const quotaUsage = about?.storageQuota?.usage ? parseInt(about.storageQuota.usage, 10) : 0;
  const quotaPercent = quotaLimit > 0 ? Math.min(100, Math.round((quotaUsage / quotaLimit) * 100)) : 0;

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-4xl py-12">
        <div className="rounded-2xl border border-line bg-surface p-8 text-center md:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-elevated border border-line">
            <HardDrive className="h-8 w-8 text-accent" />
          </div>
          <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-subtle">Google Workspace · Drive Integration</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl text-fg">Google Drive Vault</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Connect your Google Drive account with user authorization to browse files, preview documents, ingest knowledge into the Ravenstack Oracle, and manage fortress assets directly from the Keep.
          </p>

          <div className="mt-8 flex justify-center">
            {/* Official Google Sign In Button conforming to Workspace Skill */}
            <button
              id="google-drive-signin-btn"
              type="button"
              onClick={signIn}
              disabled={authLoading}
              className="group inline-flex items-center gap-3 rounded-md border border-line bg-elevated px-5 py-2.5 text-sm font-medium text-fg shadow-sm transition-all hover:border-line-strong hover:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{authLoading ? "Authorizing Google Drive…" : "Sign in with Google"}</span>
            </button>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 text-left md:grid-cols-3">
            <div className="rounded-lg border border-line bg-elevated/40 p-4">
              <h4 className="font-display text-sm font-semibold text-fg">Secure & Client-First</h4>
              <p className="mt-1 text-xs text-muted">Tokens remain safely in browser memory, never saved to persistent storage.</p>
            </div>
            <div className="rounded-lg border border-line bg-elevated/40 p-4">
              <h4 className="font-display text-sm font-semibold text-fg">Knowledge Ingestion</h4>
              <p className="mt-1 text-xs text-muted">Import Google Docs, Sheets, and Notes directly into the Oracle shelf.</p>
            </div>
            <div className="rounded-lg border border-line bg-elevated/40 p-4">
              <h4 className="font-display text-sm font-semibold text-fg">Protected Actions</h4>
              <p className="mt-1 text-xs text-muted">Every file deletion and edit requires explicit human confirmation.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-6"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Top Header & Account Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-surface p-5 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-accent" />
            <h1 className="font-display text-2xl tracking-tight text-fg">Google Drive Vault</h1>
          </div>
          <p className="mt-1 text-xs text-muted">
            Authenticated as <span className="text-fg font-medium">{user?.email || about?.user?.emailAddress || "Google User"}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Storage Quota Meter */}
          {about?.storageQuota?.limit && (
            <div className="flex min-w-[180px] flex-col gap-1 rounded-lg border border-line bg-elevated px-3 py-2 text-xs">
              <div className="flex justify-between text-muted">
                <span>Storage</span>
                <span className="font-mono text-fg">{formatBytes(quotaUsage)} / {formatBytes(quotaLimit)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={loadDriveData}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-xs text-subtle hover:text-fg"
          >
            Disconnect
          </Button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 md:flex-row md:items-center md:justify-between">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            placeholder="Search files and content in Google Drive…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-line bg-elevated py-1.5 pl-9 pr-3 text-sm text-fg placeholder:text-subtle outline-none focus:border-accent"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5 text-xs"
          >
            <Upload className="h-3.5 w-3.5 text-cyan-400" />
            Upload File
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCreatingFolder(true)}
            className="gap-1.5 text-xs"
          >
            <FolderPlus className="h-3.5 w-3.5 text-amber-400" />
            New Folder
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCreatingDoc(true)}
            className="gap-1.5 text-xs bg-accent text-bg hover:bg-accent/90"
          >
            <Plus className="h-3.5 w-3.5" />
            New Note
          </Button>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-line pb-2">
        {[
          { id: "all", label: "All Files" },
          { id: "folder", label: "Folders" },
          { id: "document", label: "Documents & PDFs" },
          { id: "spreadsheet", label: "Sheets" },
          { id: "presentation", label: "Slides" },
          { id: "image", label: "Images" },
          { id: "code", label: "Code & Notes" },
          { id: "trash", label: "Trash" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveCategory(tab.id)}
            className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeCategory === tab.id
                ? "bg-elevated text-fg border border-line"
                : "text-muted hover:text-fg"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Folder Navigation Breadcrumbs */}
      {activeCategory !== "trash" && (
        <div className="flex items-center gap-1 text-xs text-muted">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={b.id}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-subtle" />}
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={`hover:text-fg transition-colors ${
                  i === breadcrumbs.length - 1 ? "font-semibold text-fg" : "text-muted"
                }`}
              >
                {b.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="rounded-xl border-2 border-dashed border-accent bg-accent/10 p-8 text-center text-sm text-accent">
          Drop files here to upload directly to Google Drive ({breadcrumbs[breadcrumbs.length - 1]?.name})
        </div>
      )}

      {/* File Browser Grid / List */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="grid grid-cols-12 border-b border-line px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
              <div className="col-span-6 md:col-span-7">Name</div>
              <div className="hidden col-span-3 md:block">Modified</div>
              <div className="col-span-3 md:col-span-2 text-right">Size</div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted">
                <RefreshCw className="h-6 w-6 animate-spin text-accent" />
                <span className="ml-2 text-sm">Querying Google Drive…</span>
              </div>
            ) : files.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted">
                <Folder className="mx-auto h-8 w-8 text-subtle" />
                <p className="mt-2">No files found in this directory</p>
                <p className="text-xs text-subtle">Upload or create a file above.</p>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {files.map((file) => {
                  const mime = getMimeInfo(file.mimeType);
                  const isSelected = selectedFile?.id === file.id;

                  return (
                    <div
                      key={file.id}
                      onClick={() => handleItemClick(file)}
                      className={`group grid grid-cols-12 items-center px-4 py-3 text-sm transition-colors cursor-pointer hover:bg-elevated/60 ${
                        isSelected ? "bg-elevated" : ""
                      }`}
                    >
                      <div className="col-span-6 md:col-span-7 flex items-center gap-3 min-w-0 pr-2">
                        <div className="shrink-0">{getFileIcon(file)}</div>
                        <span className="truncate font-medium text-fg group-hover:text-accent">
                          {file.name}
                        </span>
                        {file.shared && (
                          <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] text-subtle">Shared</span>
                        )}
                      </div>

                      <div className="hidden col-span-3 md:block text-xs text-muted truncate">
                        {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : "—"}
                      </div>

                      <div className="col-span-6 md:col-span-2 text-right text-xs font-mono text-muted">
                        {mime.isFolder ? "Folder" : formatBytes(file.size)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selected File Details / Preview Panel */}
        <div className="lg:col-span-1">
          {selectedFile ? (
            <div className="sticky top-20 rounded-xl border border-line bg-surface p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2 border-b border-line pb-4">
                <div className="flex items-center gap-2 min-w-0">
                  {getFileIcon(selectedFile)}
                  <h3 className="truncate font-display text-base font-semibold text-fg">
                    {selectedFile.name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-subtle hover:text-fg text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Metadata */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-subtle">Type:</span>
                  <span className="text-fg">{getMimeInfo(selectedFile.mimeType).label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-subtle">Size:</span>
                  <span className="font-mono text-fg">{formatBytes(selectedFile.size)}</span>
                </div>
                {selectedFile.modifiedTime && (
                  <div className="flex justify-between">
                    <span className="text-subtle">Last Modified:</span>
                    <span className="text-fg">{new Date(selectedFile.modifiedTime).toLocaleString()}</span>
                  </div>
                )}
                {selectedFile.owners?.[0] && (
                  <div className="flex justify-between">
                    <span className="text-subtle">Owner:</span>
                    <span className="text-fg truncate max-w-[150px]">{selectedFile.owners[0].displayName}</span>
                  </div>
                )}
              </div>

              {/* File Content Preview */}
              <div className="rounded-lg border border-line bg-elevated/50 p-3">
                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-subtle mb-2">
                  <span>Preview</span>
                  {previewLoading && <RefreshCw className="h-3 w-3 animate-spin text-accent" />}
                </div>
                {previewLoading ? (
                  <div className="py-6 text-center text-xs text-muted">Loading preview…</div>
                ) : previewContent ? (
                  <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-muted">
                    {previewContent.slice(0, 1000)}
                    {previewContent.length > 1000 ? "\n\n… [Content truncated for preview]" : ""}
                  </pre>
                ) : (
                  <p className="py-4 text-center text-xs text-subtle">
                    {selectedFile.mimeType.startsWith("image/")
                      ? "Image file (Use Open in Drive to view full size)"
                      : "Binary or non-text document"}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-2">
                {selectedFile.webViewLink && (
                  <a
                    href={selectedFile.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-elevated px-3 py-1.5 text-xs text-fg hover:border-line-strong hover:bg-surface transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Google Drive
                  </a>
                )}

                {/* Ingest into Keep Knowledge Shelf */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleIngestKnowledge(selectedFile)}
                  className="gap-1.5 text-xs border-accent/40 text-accent hover:bg-accent/10"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  {ingestedFiles.has(selectedFile.id) ? "Ingested in Oracle" : "Ingest into Oracle Shelf"}
                </Button>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRenameTarget(selectedFile);
                      setRenameValue(selectedFile.name);
                    }}
                    className="flex-1 text-xs text-muted hover:text-fg"
                  >
                    Rename
                  </Button>

                  {selectedFile.trashed ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => promptPermanentDelete(selectedFile)}
                      className="flex-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      Delete Forever
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => promptTrashFile(selectedFile)}
                      className="flex-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Trash
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-surface/50 p-8 text-center text-xs text-muted">
              <Eye className="mx-auto h-6 w-6 text-subtle" />
              <p className="mt-2 font-medium">Select a file to inspect details</p>
              <p className="mt-1 text-subtle">Preview text, ingest into Oracle, or open directly in Google Drive.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Folder Modal */}
      {isCreatingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl">
            <h3 className="font-display text-lg text-fg">New Google Drive Folder</h3>
            <p className="mt-1 text-xs text-muted">Create a new directory inside {breadcrumbs[breadcrumbs.length - 1]?.name}.</p>
            <form onSubmit={handleCreateFolderSubmit} className="mt-4">
              <input
                type="text"
                autoFocus
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              />
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreatingFolder(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!newFolderName.trim()}>
                  Create Folder
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Document / Note Modal */}
      {isCreatingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-xl">
            <h3 className="font-display text-lg text-fg">New Note in Google Drive</h3>
            <p className="mt-1 text-xs text-muted">Save a Markdown note or document directly into your Drive.</p>
            <form onSubmit={handleCreateDocSubmit} className="mt-4 space-y-3">
              <input
                type="text"
                autoFocus
                placeholder="Document Title (e.g. audit_notes.md)"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                className="w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              />
              <textarea
                rows={6}
                placeholder="Document contents…"
                value={newDocContent}
                onChange={(e) => setNewDocContent(e.target.value)}
                className="w-full rounded-md border border-line bg-elevated px-3 py-2 font-mono text-sm text-fg outline-none focus:border-accent"
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreatingDoc(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!newDocName.trim()}>
                  Save to Drive
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl">
            <h3 className="font-display text-lg text-fg">Rename File</h3>
            <p className="mt-1 text-xs text-muted">Enter a new name for "{renameTarget.name}".</p>
            <form onSubmit={handleRenameSubmit} className="mt-4">
              <input
                type="text"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              />
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setRenameTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!renameValue.trim()}>
                  Rename
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Dialog (Mandatory per Google Workspace Skill for destructive/mutating operations) */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="font-display text-lg font-semibold text-fg">{confirmModal.title}</h3>
            </div>
            <p className="mt-3 text-sm text-muted leading-relaxed">{confirmModal.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                  await confirmModal.onConfirm();
                }}
                className={
                  confirmModal.isDestructive
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-accent text-bg"
                }
              >
                {confirmModal.actionLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
