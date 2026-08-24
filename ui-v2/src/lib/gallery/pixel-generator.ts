/**
 * Gallery Theme & Image Utilities
 * NO fake procedural canvas drawing. All portraits are generated via real Google Imagen 3 API calls.
 */

export const GALLERY_PALETTE = {
  voidBg: "#0b0e14",
  stoneDim: "#1e222b",
  stoneMasonry: "#3a3f4b",
  stonePlate: "#4a5568",
  cyanNeon: "#2de2e6",
  magentaGlow: "#ff2a6d",
  amberTorch: "#ffc857",
  emeraldRunes: "#39ff14",
  crimsonFault: "#ff3b3b",
  parchmentLight: "#f4ede2",
  gildedGold: "#d4af37",
};

/**
 * High-definition 16-bit cyber-arcane SVG pixel avatars for default Sovereign Legends.
 * Used exclusively as static initial seeds before custom Imagen 3 commissions.
 */
function createSvgPixelAvatar(name: string, title: string, accentColor: string, subColor: string, glyph: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" shape-rendering="crispEdges">
    <rect width="128" height="128" fill="#0b0e14"/>
    <rect x="8" y="8" width="112" height="112" fill="#1e222b" stroke="${accentColor}" stroke-width="2"/>
    <rect x="16" y="16" width="96" height="96" fill="#12161f"/>
    <!-- Cyber Arcane Pixel Mantle -->
    <rect x="32" y="72" width="64" height="40" fill="#3a3f4b"/>
    <rect x="40" y="64" width="48" height="16" fill="#4a5568"/>
    <rect x="44" y="32" width="40" height="40" fill="#2a2e39"/>
    <!-- Neon Highlights -->
    <rect x="48" y="44" width="12" height="6" fill="${accentColor}"/>
    <rect x="68" y="44" width="12" height="6" fill="${accentColor}"/>
    <rect x="52" y="60" width="24" height="4" fill="${subColor}"/>
    <!-- Crest Glyph -->
    <text x="64" y="100" font-family="monospace" font-size="20" fill="${accentColor}" text-anchor="middle">${glyph}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEFAULT_LEGEND_AVATARS: Record<string, string> = {
  boydimus: createSvgPixelAvatar("Jason Boyd", "The Ravenlord", "#2de2e6", "#ff2a6d", "🦅"),
  valerie: createSvgPixelAvatar("Valerie", "Fortress Mechanic", "#ffc857", "#ff2a6d", "⚙️"),
  raziel: createSvgPixelAvatar("Raziel", "Arch-Orchestrator", "#2de2e6", "#39ff14", "👑"),
};
