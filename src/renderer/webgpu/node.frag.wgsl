// Signed distance to a rounded rectangle centered at the origin
fn roundedRectSDF(p: vec2f, halfSize: vec2f, radius: f32) -> f32 {
  let q = abs(p) - halfSize + vec2f(radius);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

// Nodes have no visible box; this draws the faint highlight behind hovered
// and selected propositions (its opacity comes in color.a, 0 otherwise).
@fragment
fn main(
  @location(0) local: vec2f,
  @location(1) color: vec4f,
  @location(2) halfSize: vec2f,
  @location(3) cornerRadius: f32
) -> @location(0) vec4f {
  if (color.a <= 0.0) {
    discard;
  }
  let d = roundedRectSDF(local, halfSize, cornerRadius);
  // World units per screen pixel, for pixel-accurate anti-aliasing
  let px = max(fwidth(d), 1e-6);
  let fill = clamp(0.5 - d / px, 0.0, 1.0);
  return vec4f(color.rgb, color.a * fill);
}
