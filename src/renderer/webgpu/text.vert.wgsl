struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
  @location(1) color: vec4f,
};

struct Uniforms {
  viewProj: mat4x4f,
};

struct GlyphData {
  position: vec2f,      // World position (x, y)
  atlasPos: vec2f,      // Atlas texture coordinates (normalized 0-1)
  atlasSize: vec2f,     // Glyph size in atlas (normalized)
  glyphSize: vec2f,     // Glyph size in world space
  color: vec4f,         // Text color
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> glyphs: array<GlyphData>;

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  // Quad vertices for glyph (two triangles)
  var positions = array<vec2f, 6>(
    vec2f(0.0, 0.0),  // Bottom-left
    vec2f(1.0, 0.0),  // Bottom-right
    vec2f(0.0, 1.0),  // Top-left
    vec2f(0.0, 1.0),  // Top-left
    vec2f(1.0, 0.0),  // Bottom-right
    vec2f(1.0, 1.0)   // Top-right
  );

  var texCoords = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0)
  );

  var glyph = glyphs[instanceIndex];
  var pos = positions[vertexIndex];

  // Calculate world position for this vertex
  var worldPos = vec4f(
    glyph.position.x + pos.x * glyph.glyphSize.x,
    glyph.position.y + pos.y * glyph.glyphSize.y,
    0.0,
    1.0
  );

  // Calculate texture coordinate in atlas
  var texCoord = glyph.atlasPos + texCoords[vertexIndex] * glyph.atlasSize;

  var output: VertexOutput;
  output.position = uniforms.viewProj * worldPos;
  output.texCoord = texCoord;
  output.color = glyph.color;

  return output;
}
