export const NONE = '-1';

/** Horizontal gap between tree columns (room for the edge curves) */
export const LAYER_GAP = 80;
/** Vertical gap between siblings / between different subtrees */
export const SIBLING_GAP = 10;
export const SUBTREE_GAP = 24;

/** Size of the root dot */
export const EMPTY_NODE_SIZE = 8;

export const NODE_STRIDE = 12;
export const LINK_STRIDE = 12;

const SEGMENT_COUNT = 256;
export const VERTICES_PER_EDGE = (SEGMENT_COUNT + 1) * 2;

// Text rendering constants
export const TEXT_GLYPH_STRIDE = 12; // floats per glyph instance
// [posX, posY, sizeX, sizeY, atlasPosX, atlasPosY, atlasSizeX, atlasSizeY,
//  colorR, colorG, colorB, colorA]
// (12 floats = 48 bytes, matches WGSL GlyphData struct layout)

export const PROPOSITION_ID_COLOR = [0.25, 0.25, 0.25, 1.0] as const;
export const PROPOSITION_TEXT_COLOR = [0.08, 0.08, 0.08, 1.0] as const;

/** Font sizes in world units per em */
export const TEXT_FONT_SIZE = 12;
export const ID_FONT_SIZE = 17;

// Layout constants for text positioning
export const FIXED_TEXT_WIDTH = 240; // Fixed width for text layout
export const PADDING_X = 12; // Horizontal padding
export const PADDING_Y = 10; // Vertical padding
export const ID_GAP = 10; // Space between proposition ID and text
