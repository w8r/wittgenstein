// Signed distance to a rounded rectangle centered at the origin
fn roundedRectSDF(p: vec2f, halfSize: vec2f, radius: f32) -> f32 {
  let q = abs(p) - halfSize + vec2f(radius);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

const OUTLINE_COLOR: vec3f = vec3f(0.2, 0.2, 0.2);
// Width of the collapsed marker on the right edge, in world units
const COLLAPSED_BAR: f32 = 4.0;

@fragment
fn main(
  @location(0) local: vec2f,
  @location(1) color: vec4f,
  @location(2) halfSize: vec2f,
  @location(3) cornerRadius: f32,
  @location(4) isCollapsed: f32,
  @location(5) state: f32
) -> @location(0) vec4f {
  let d = roundedRectSDF(local, halfSize, cornerRadius);
  // World units per screen pixel, for pixel-accurate anti-aliasing
  let px = max(fwidth(d), 1e-6);

  let s = u32(state + 0.5);
  let hovered = (s & 1u) != 0u;
  let selected = (s & 2u) != 0u;

  var rgb = color.rgb;
  var alpha = color.a;
  if (hovered || selected) {
    rgb = rgb * 0.92;
    alpha = min(1.0, alpha + 0.35);
  }

  // Collapsed nodes with hidden children get a darker bar on the right edge
  if (isCollapsed > 0.5 && local.x > halfSize.x - COLLAPSED_BAR) {
    rgb = rgb * 0.75;
    alpha = min(1.0, alpha + 0.4);
  }

  let fill = clamp(0.5 - d / px, 0.0, 1.0);
  var result = vec4f(rgb, alpha * fill);

  // Selection outline: 2px band just outside the shape
  if (selected) {
    let outline = clamp(1.0 - abs(d / px - 1.5) / 1.5, 0.0, 1.0);
    let outlineAlpha = color.a / 0.5; // fades with the node
    result = mix(result, vec4f(OUTLINE_COLOR, min(outlineAlpha, 1.0)), outline);
  }

  return result;
}
