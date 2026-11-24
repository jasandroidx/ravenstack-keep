/**
 * One frame of a Ravenlord sheet, not the whole grid.
 *
 * The armour sources are 4x4 walk sheets (32x40 frames: down / left / right /
 * up). Rendering the raw file in an <img> shows sixteen little bodies, which is
 * what the wardrobe and Teleport screens used to do. This crops to frame 0
 * (the down-facing idle) with CSS instead of shipping a second portrait file
 * per skin, so a new sheet still needs exactly one asset.
 */

export const SKIN_FRAME_W = 32;
export const SKIN_FRAME_H = 40;

export function SkinPreview({
  src,
  name,
  height = 80,
  className = "",
}: {
  src: string;
  name: string;
  height?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={name}
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: Math.round((height * SKIN_FRAME_W) / SKIN_FRAME_H),
        height,
        backgroundImage: `url(${src})`,
        // 4x4 sheet => the box shows the top-left cell when the image is drawn
        // at 4x its own size and anchored at 0 0.
        backgroundSize: "400% 400%",
        backgroundPosition: "0 0",
        imageRendering: "pixelated",
      }}
    />
  );
}
