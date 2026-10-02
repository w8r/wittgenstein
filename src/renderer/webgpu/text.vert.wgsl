struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
  @location(1) color: vec4f,
};

struct Uniforms {
  viewProj: mat4x4f,
};

struct GlyphData {
  position: vec2f,      // World position of the quad's bottom-left corner
  glyphSize: vec2f,     // Quad size in world space
  atlasPos: vec2f,      // Atlas rect top-left (normalized, y-down)
  atlasSize: vec2f,     // Atlas rect size (normalized)
  color: vec4f,         // Text color
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> glyphs: array<GlyphData>;

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  // Quad vertices for glyph (two triangles), y-up
  var positions = array<vec2f, 6>(
    vec2f(0.0, 0.0),  // Bottom-left
    vec2f(1.0, 0.0),  // Bottom-right
    vec2f(0.0, 1.0),  // Top-left
    vec2f(0.0, 1.0),  // Top-left
    vec2f(1.0, 0.0),  // Bottom-right
    vec2f(1.0, 1.0)   // Top-right
  );

  let glyph = glyphs[instanceIndex];
  let pos = positions[vertexIndex];

  let worldPos = vec4f(glyph.position + pos * glyph.glyphSize, 0.0, 1.0);

  // Atlas texture space is y-down: the top of the quad maps to atlasPos.y
  let texCoord = glyph.atlasPos + vec2f(pos.x, 1.0 - pos.y) * glyph.atlasSize;

  var output: VertexOutput;
  output.position = uniforms.viewProj * worldPos;
  output.texCoord = texCoord;
  output.color = glyph.color;

  return output;
}
