@fragment
fn main(
  @location(0) tParam: f32,
  @location(1) sidePos: f32,
  @location(2) color: vec4f
) -> @location(0) vec4f {
  // Create anti-aliased edge
  let fade = 1.0 - abs(sidePos);
  let edgeAA = smoothstep(0.0, 0.1, fade);

  // Make ends of curve taper a bit
  let endTaper = min(
    smoothstep(0.0, 0.1, tParam),     // Start taper
    smoothstep(1.0, 0.9, tParam)      // End taper
  );

  // Combine effects
  let alpha = color.a * edgeAA;

  return vec4f(color.rgb, alpha);
}
