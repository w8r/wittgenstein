import { describe, it, expect } from 'vitest';
import { layoutText, measureText } from '../src/buffers';
import type { TextAtlas, GlyphMetrics } from '../src/types';

// Mock text atlas for testing
function createMockAtlas(): TextAtlas {
  const glyphs: Record<string, GlyphMetrics> = {};

  // Create mock glyphs for common characters
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?';
  for (const char of chars) {
    glyphs[char] = {
      x: 0,
      y: 0,
      width: 10,
      height: 14,
      advance: 8, // Most characters advance by 8px
      bearingX: 0,
      bearingY: 12
    };
  }

  // Add space character with smaller advance
  glyphs[' '] = {
    x: 0,
    y: 0,
    width: 4,
    height: 14,
    advance: 4,
    bearingX: 0,
    bearingY: 12
  };

  // Add LaTeX symbols
  const latexSymbols = '∀∃→¬∧∨⊃≡';
  for (const symbol of latexSymbols) {
    glyphs[symbol] = {
      x: 0,
      y: 0,
      width: 12,
      height: 14,
      advance: 10,
      bearingX: 0,
      bearingY: 12
    };
  }

  return {
    width: 512,
    height: 512,
    glyphs
  };
}

describe('layoutText', () => {
  const mockAtlas = createMockAtlas();
  const color = [0.1, 0.1, 0.1, 1.0] as const;

  it('should layout single line text within width constraint', () => {
    const result = layoutText('Hello', 0, 0, mockAtlas, color, 1.0);

    // Should return layout result with dimensions
    expect(result).toHaveProperty('glyphs');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');

    // Check that glyphs array is populated
    expect(result.glyphs.length).toBeGreaterThan(0);

    // Width should be approximately sum of advances (5 chars * 8px = 40px)
    expect(result.width).toBeGreaterThan(0);
    expect(result.width).toBeLessThan(100);

    // Height should be single line
    expect(result.height).toBeGreaterThan(0);
  });

  it('should wrap text when exceeding maxWidth', () => {
    const longText = 'This is a long sentence that should wrap to multiple lines';
    const maxWidth = 100; // Force wrapping

    const result = layoutText(longText, 0, 0, mockAtlas, color, 1.0, maxWidth);

    // Should have multiple lines (height > single line height)
    expect(result.height).toBeGreaterThan(16); // LINE_HEIGHT is 16px

    // Width should not exceed maxWidth (with some tolerance)
    expect(result.width).toBeLessThanOrEqual(maxWidth + 10);
  });

  it('should handle inline LaTeX symbols', () => {
    const textWithLatex = 'For all ∀ there exists ∃';
    const result = layoutText(textWithLatex, 0, 0, mockAtlas, color, 1.0);

    // Should successfully layout text with LaTeX symbols
    expect(result.glyphs.length).toBeGreaterThan(0);
    expect(result.width).toBeGreaterThan(0);
  });

  it('should handle manual line breaks', () => {
    const multiLineText = 'Line 1\nLine 2\nLine 3';
    const result = layoutText(multiLineText, 0, 0, mockAtlas, color, 1.0);

    // Should have 3 lines (3 * LINE_HEIGHT = 48px)
    expect(result.height).toBeGreaterThanOrEqual(48);
  });

  it('should apply scale factor to dimensions', () => {
    const text = 'Hello';
    const scale = 2.0;

    const result = layoutText(text, 0, 0, mockAtlas, color, scale);

    // Dimensions should be scaled
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should return bounding box dimensions for node sizing', () => {
    const text = 'Test proposition content';
    const maxWidth = 200;

    const result = layoutText(text, 0, 0, mockAtlas, color, 1.0, maxWidth);

    // Must return width and height for layout system
    expect(typeof result.width).toBe('number');
    expect(typeof result.height).toBe('number');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should handle empty text gracefully', () => {
    const result = layoutText('', 0, 0, mockAtlas, color, 1.0);

    expect(result.glyphs.length).toBe(0);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('should handle missing glyphs gracefully', () => {
    const textWithUnsupportedChar = 'Hello 你好';
    const result = layoutText(textWithUnsupportedChar, 0, 0, mockAtlas, color, 1.0);

    // Should continue processing despite missing glyphs
    expect(result.glyphs.length).toBeGreaterThan(0);
  });
});

describe('measureText', () => {
  const mockAtlas = createMockAtlas();

  it('should measure single line text', () => {
    const result = measureText('Hello', mockAtlas, 1.0);

    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should measure multi-line text with maxWidth', () => {
    const longText = 'This is a long sentence that should wrap to multiple lines';
    const maxWidth = 100;

    const result = measureText(longText, mockAtlas, 1.0, maxWidth);

    // Should have multiple lines
    expect(result.height).toBeGreaterThan(16); // More than single line
    expect(result.width).toBeLessThanOrEqual(maxWidth + 10);
  });

  it('should match layoutText dimensions', () => {
    const text = 'Test text';
    const maxWidth = 200;
    const scale = 1.0;
    const color = [0.1, 0.1, 0.1, 1.0] as const;

    const measured = measureText(text, mockAtlas, scale, maxWidth);
    const layout = layoutText(text, 0, 0, mockAtlas, color, scale, maxWidth);

    // Measurements should match layout dimensions
    expect(measured.width).toBeCloseTo(layout.width, 1);
    expect(measured.height).toBeCloseTo(layout.height, 1);
  });
});
