@fragment
fn main(
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) size: vec2f,
  @location(3) cornerRadius: f32
) -> @location(0) vec4f {
  // Calculate distance from nearest edge
  let dx = min(uv.x * size.x, (1.0 - uv.x) * size.x);
  let dy = min(uv.y * size.y, (1.0 - uv.y) * size.y);

  // Corner check
  let isInCornerRegion = (dx < cornerRadius) && (dy < cornerRadius);

  if (isInCornerRegion) {
    // Calculate distance to corner
    let distToCorner = length(vec2f(cornerRadius - dx, cornerRadius - dy));

    if (distToCorner > cornerRadius) {
      // Outside the rounded corner
      return vec4f(0.0);
    }

    // Anti-aliasing for the corner
    let alpha = smoothstep(cornerRadius + 1.0, cornerRadius - 1.0, distToCorner);
    return vec4f(color.rgb, color.a * alpha);
  }

  // Inside the rectangle (not in corner region)
  return color;
}
