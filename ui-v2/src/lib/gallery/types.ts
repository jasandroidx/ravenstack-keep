export interface PortraitItem {
  id: string | number;
  slotNumber: number; // 1 - 8
  subjectName: string;
  arcaneTitle: string;
  customModifier?: string;
  trivia?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  lore: string;
  createdAt: string;
  updatedAt?: string;
  isLegendary?: boolean;
}

export interface CommissionRequest {
  slotNumber: number;
  subjectName: string;
  arcaneTitle: string;
  customModifier?: string;
  trivia?: string;
  uploadedPhotoDataUrl?: string;
}

export interface LoreRerollRequest {
  id: string | number;
  subjectName: string;
  arcaneTitle: string;
  customModifier?: string;
  trivia?: string;
}
