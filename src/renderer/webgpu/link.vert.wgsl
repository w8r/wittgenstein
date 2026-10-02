struct VertexOutput {
  @builtin(position) position: vec4f,
  // Signed distance from the curve center line, in screen pixels
  @location(0) dist: f32,
  @location(1) halfWidth: f32,
  @location(2) color: vec4f,
};

struct Uniforms {
  viewProj: mat4x4f,
  viewport: vec2f,     // Canvas size in pixels
  _pad: vec2f,
};

struct LinkData {
  lsource: vec2f,
  ltarget: vec2f,
  control1: vec2f,
  control2: vec2f,
  color: vec4f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var<storage, read> links: array<LinkData>;

// Must match SEGMENT_COUNT in constants.ts
const SEGMENT_COUNT: u32 = 256u;
// Edge width in world units, clamped to a readable range of screen pixels
const WORLD_WIDTH: f32 = 1.5;
const MIN_WIDTH_PX: f32 = 1.0;
const MAX_WIDTH_PX: f32 = 3.0;
// Extra pixels on each side for anti-aliasing
const AA_MARGIN_PX: f32 = 1.0;

// Cubic Bezier function
fn cubicBezier(p0: vec2f, p1: vec2f, p2: vec2f, p3: vec2f, t: f32) -> vec2f {
  let mt = 1.0 - t;
  return p0 * (mt * mt * mt) + p1 * (3.0 * mt * mt * t) + p2 * (3.0 * mt * t * t) + p3 * (t * t * t);
}

// Cubic Bezier derivative function
fn cubicBezierDerivative(p0: vec2f, p1: vec2f, p2: vec2f, p3: vec2f, t: f32) -> vec2f {
  let mt = 1.0 - t;
  return (p1 - p0) * (3.0 * mt * mt) + (p2 - p1) * (6.0 * mt * t) + (p3 - p2) * (3.0 * t * t);
}

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  let link = links[instanceIndex];

  // Triangle strip: two vertices (one per side) per curve sample
  let segmentIndex = vertexIndex / 2u;
  let side = f32(vertexIndex % 2u) * 2.0 - 1.0; // -1 or 1
  let t = f32(segmentIndex) / f32(SEGMENT_COUNT);

  let curvePos = cubicBezier(link.lsource, link.control1, link.control2, link.ltarget, t);
  var tangent = cubicBezierDerivative(link.lsource, link.control1, link.control2, link.ltarget, t);
  if (length(tangent) < 1e-6) {
    tangent = link.ltarget - link.lsource;
  }

  // Extrude in screen space so the width is independent of the zoom level
  let halfViewport = uniforms.viewport * 0.5;
  let clipPos = uniforms.viewProj * vec4f(curvePos, 0.0, 1.0);
  let tangentPx = (uniforms.viewProj * vec4f(tangent, 0.0, 0.0)).xy * halfViewport;
  let normalPx = normalize(vec2f(-tangentPx.y, tangentPx.x));

  let pxPerWorld = uniforms.viewProj[1][1] * halfViewport.y;
  let widthPx = clamp(WORLD_WIDTH * pxPerWorld, MIN_WIDTH_PX, MAX_WIDTH_PX);
  let extrudePx = widthPx * 0.5 + AA_MARGIN_PX;

  var output: VertexOutput;
  output.position = vec4f(
    clipPos.xy + normalPx * side * extrudePx / halfViewport * clipPos.w,
    clipPos.zw
  );
  output.dist = side * extrudePx;
  output.halfWidth = widthPx * 0.5;
  output.color = link.color;
  return output;
}
