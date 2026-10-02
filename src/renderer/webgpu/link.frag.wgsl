@fragment
fn main(
  @location(0) dist: f32,
  @location(1) halfWidth: f32,
  @location(2) color: vec4f
) -> @location(0) vec4f {
  // Pixel coverage of the line, anti-aliased over one pixel
  let coverage = clamp(halfWidth + 0.5 - abs(dist), 0.0, 1.0);
  return vec4f(color.rgb, color.a * coverage);
}
