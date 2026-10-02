@group(1) @binding(0) var atlasSampler: sampler;
@group(1) @binding(1) var atlasTexture: texture_2d<f32>;

// MSDF distance range in atlas texels (set at pipeline creation)
override PX_RANGE: f32 = 4.0;

fn median3(a: f32, b: f32, c: f32) -> f32 {
  return max(min(a, b), min(max(a, b), c));
}

@fragment
fn main(
  @location(0) texCoord: vec2f,
  @location(1) color: vec4f
) -> @location(0) vec4f {
  let msdf = textureSample(atlasTexture, atlasSampler, texCoord).rgb;
  let sd = median3(msdf.r, msdf.g, msdf.b) - 0.5;

  // Distance range expressed in screen pixels at the current zoom
  let unitRange = vec2f(PX_RANGE) / vec2f(textureDimensions(atlasTexture));
  let screenTexSize = vec2f(1.0) / fwidth(texCoord);
  let screenPxRange = max(0.5 * dot(unitRange, screenTexSize), 1.0);

  let opacity = clamp(screenPxRange * sd + 0.5, 0.0, 1.0);
  if (opacity <= 0.0) {
    discard;
  }

  return vec4f(color.rgb, color.a * opacity);
}
