export const NONE = '-1';
export const LAYER_GAP = 10;

export const COLLAPSED_SIZE = 10;

export const NODE_STRIDE = 12;
export const LINK_STRIDE = 12;

export const SEGMENT_COUNT = 80;
export const VERTICES_PER_EDGE = (SEGMENT_COUNT + 1) * 2;

// Text rendering constants
export const TEXT_GLYPH_STRIDE = 16; // floats per glyph instance
// [posX, posY, atlasPosX, atlasPosY, atlasSizeX, atlasSizeY, glyphSizeX, glyphSizeY,
//  colorR, colorG, colorB, colorA, padding1, padding2, padding3, padding4]
// (16 floats for alignment, WebGPU prefers 16-byte aligned structs)

export const PROPOSITION_ID_COLOR = [0.2, 0.2, 0.2, 1.0] as const; // Dark gray for IDs
export const PROPOSITION_TEXT_COLOR = [0.1, 0.1, 0.1, 1.0] as const; // Near-black for text
export const PROPOSITION_ID_SCALE = 1.5; // Larger size for IDs (per CONTEXT.md: "larger and bold")
export const LINE_HEIGHT = 16; // pixels (adjust based on font size)
export const ID_OFFSET = 20; // pixels to the left of text block

// Layout constants for text positioning
export const FIXED_TEXT_WIDTH = 200; // Fixed width for text layout
export const PADDING_X = 12; // Horizontal padding
export const PADDING_Y = 8; // Vertical padding
export const ID_WIDTH = 40; // Space reserved for proposition ID
