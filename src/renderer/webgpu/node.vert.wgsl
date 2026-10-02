struct VertexOutput {
  @builtin(position) position: vec4f,
  // Position inside the node in world units, relative to its center
  @location(0) local: vec2f,
  @location(1) color: vec4f,
  @location(2) halfSize: vec2f,
  @location(3) cornerRadius: f32,
  @location(4) isCollapsed: f32,
  @location(5) state: f32,
};

struct Uniforms {
  viewProj: mat4x4f,
};

struct NodeData {
  position: vec2f,
  size: vec2f,
  isCollapsed: f32,
  state: f32,          // bit 0: hovered, bit 1: selected
  padding1: f32,
  padding2: f32,
  color: vec4f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> nodes: array<NodeData>;

// Extra margin around the quad so outlines and anti-aliasing aren't clipped
const MARGIN: f32 = 4.0;

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  // Quad vertices (counter-clockwise), -1..1
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0)
  );

  let node = nodes[instanceIndex];
  let halfSize = node.size * 0.5;
  let local = corners[vertexIndex] * (halfSize + vec2f(MARGIN));
  let center = node.position + halfSize;

  var output: VertexOutput;
  output.position = uniforms.viewProj * vec4f(center + local, 0.0, 1.0);
  output.local = local;
  output.color = node.color;
  output.halfSize = halfSize;
  output.cornerRadius = min(8.0, min(halfSize.x, halfSize.y));
  output.isCollapsed = node.isCollapsed;
  output.state = node.state;
  return output;
}
