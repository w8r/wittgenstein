struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) tParam: f32,
  @location(1) sidePos: f32,
  @location(2) color: vec4f,

  @location(3) p0: vec2f,
  @location(4) cp1: vec2f,
  @location(5) cp2: vec2f,
  @location(6) p1: vec2f,
  @location(7) localPos: f32,
};

struct Uniforms {
  viewProj: mat4x4f,
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

// Cubic Bezier function
fn cubicBezier(p0: vec2f, p1: vec2f, p2: vec2f, p3: vec2f, t: f32) -> vec2f {
  let t2 = t * t;
  let t3 = t2 * t;
  let mt = 1.0 - t;
  let mt2 = mt * mt;
  let mt3 = mt2 * mt;

  return p0 * mt3 + p1 * 3.0 * mt2 * t + p2 * 3.0 * mt * t2 + p3 * t3;
}

// Cubic Bezier derivative function
fn cubicBezierDerivative(p0: vec2f, p1: vec2f, p2: vec2f, p3: vec2f, t: f32) -> vec2f {
  let t2 = t * t;
  let mt = 1.0 - t;
  let mt2 = mt * mt;

  return (p1 - p0) * 3.0 * mt2 + (p2 - p1) * 6.0 * mt * t + (p3 - p2) * 3.0 * t2;
}

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  var link = links[instanceIndex];


  // Constants for tessellation
  let segmentCount = 39u;
  let verticesPerSegment = 2u; // Two vertices per segment for a triangle strip

  // Calculate segment index and side
  let segmentIndex = vertexIndex / verticesPerSegment;
  let side = f32(vertexIndex % verticesPerSegment) * 2.0 - 1.0; // -1 or 1

  // Calculate t parameter for this point
  let t = f32(segmentIndex) / f32(segmentCount);

  // Calculate position on curve
  let curvePos = cubicBezier(
    link.lsource,
    link.control1,
    link.control2,
    link.ltarget,
    t
  );

  // Calculate tangent vector (derivative of the bezier curve)
  let tangent = cubicBezierDerivative(
    link.lsource,
    link.control1,
    link.control2,
    link.ltarget,
    t
  );

  // Normalize tangent and calculate normal
  let normalizedTangent = normalize(tangent);
  let normal = vec2f(-normalizedTangent.y, normalizedTangent.x);

  let zoom = uniforms.viewProj[0][0];
  // Line width (can be made variable based on zoom level)
  let lineWidth = 0.1 * zoom; // Adjust based on your projection matrix

  // Final position
  let finalPos = curvePos + normal * side * lineWidth;

  var output: VertexOutput;
  output.position = uniforms.viewProj * vec4f(finalPos, 0.0, 1.0);
  output.tParam = t;
  output.sidePos = side;
  output.color = link.color;

  let curve = links[instanceIndex];
  let p0 = curve.lsource;
  let cp1 = curve.control1;
  let cp2 = curve.control2;
  let p1 = curve.ltarget;
  let minPt = min(p0, min(p1, min(cp1, cp2)));
  let maxPt = max(p0, max(p1, max(cp1, cp2)));

  let center = (minPt + maxPt) * 0.5;
  let size = maxPt - minPt + lineWidth;

  output.p0 = p0;
  output.cp1 = cp1;
  output.cp2 = cp2;
  output.p1 = p1;

  return output;
}
