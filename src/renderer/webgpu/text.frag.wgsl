@group(1) @binding(0) var atlasSampler: sampler;
@group(1) @binding(1) var atlasTexture: texture_2d<f32>;

@fragment
fn main(
  @location(0) texCoord: vec2f,
  @location(1) color: vec4f
) -> @location(0) vec4f {
  // Sample MSDF texture (3 channels: R, G, B)
  let msdf = textureSample(atlasTexture, atlasSampler, texCoord).rgb;

  // Median-of-three: standard MSDF technique
  let median = max(min(msdf.r, msdf.g), min(max(msdf.r, msdf.g), msdf.b));

  // Distance field threshold
  let threshold = 0.5;
  let distance = median - threshold;

  // Anti-aliasing with screenspace derivatives
  let width = length(vec2f(dpdx(distance), dpdy(distance)));
  let alpha = smoothstep(-width, width, distance);

  // Output color with alpha from distance field
  return vec4f(color.rgb, color.a * alpha);
}
