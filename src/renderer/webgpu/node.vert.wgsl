struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) size: vec2f,
  @location(3) cornerRadius: f32,
};

struct Uniforms {
  viewProj: mat4x4f,
};

struct NodeData {
  position: vec2f,
  size: vec2f,
  isCollapsed: f32,
  hasFormula: f32,
  padding1: f32,
  padding2: f32,
  color: vec4f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> nodes: array<NodeData>;

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  // Quad vertices (counter-clockwise)
  var positions = array<vec2f, 6>(
    vec2f(0.0, 0.0),  // Bottom-left
    vec2f(1.0, 0.0),  // Bottom-right
    vec2f(0.0, 1.0),  // Top-left
    vec2f(0.0, 1.0),  // Top-left
    vec2f(1.0, 0.0),  // Bottom-right
    vec2f(1.0, 1.0)   // Top-right
  );

  // UVs
  var uvs = array<vec2f, 6>(
    vec2f(0.0, 0.0),  // Bottom-left
    vec2f(1.0, 0.0),  // Bottom-right
    vec2f(0.0, 1.0),  // Top-left
    vec2f(0.0, 1.0),  // Top-left
    vec2f(1.0, 0.0),  // Bottom-right
    vec2f(1.0, 1.0)   // Top-right
  );

  var node = nodes[instanceIndex];
  var pos = positions[vertexIndex];

  // Calculate world position
  var worldPos = vec4f(
    node.position.x + pos.x * node.size.x,
    node.position.y + pos.y * node.size.y,
    0.0,
    1.0
  );

  var output: VertexOutput;
  output.position = uniforms.viewProj * worldPos;
  output.uv = uvs[vertexIndex];
  output.color = node.color;
  output.size = node.size;

  // Calculate corner radius (a percentage of the smaller dimension)
  let minDim = min(node.size.x, node.size.y);
  output.cornerRadius = minDim * 0.1; // 10% of the smaller dimension

  return output;
}
