import nodeFragmentShaderSrc from './node.frag.wgsl?raw';
import nodeVertexShaderSrc from './node.vert.wgsl?raw';
import linkFragmentShaderSrc from './link.frag.wgsl?raw';
import linkVertexShaderSrc from './link.vert.wgsl?raw';
import textFragmentShaderSrc from './text.frag.wgsl?raw';
import textVertexShaderSrc from './text.vert.wgsl?raw';
import { BaseRenderer } from '../base';
import { VERTICES_PER_EDGE } from '../../constants';

const QUAD_VERTICES = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5
]);
const QUAD_VERTEX_COUNT = 4;

export class Renderer extends BaseRenderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private viewProjBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;
  private depthTexture!: GPUTexture;
  private nodePipeline!: GPURenderPipeline;
  private linkPipeline!: GPURenderPipeline;
  private nodeBuffer!: GPUBuffer;
  private linkBuffer!: GPUBuffer;
  private quadBuffer!: GPUBuffer;

  // Text rendering resources
  private textPipeline!: GPURenderPipeline;
  private textBindGroup!: GPUBindGroup;
  private textureBindGroup!: GPUBindGroup;
  private glyphBuffer!: GPUBuffer;
  private atlasTexture!: GPUTexture;
  private atlasSampler!: GPUSampler;
  private textEnabled: boolean = false;

  protected nodeCount: number = 0;
  protected linkCount: number = 0;
  protected glyphCount: number = 0;

  private createViewProjBuffer(view: Float32Array) {
    this.viewProjBuffer = this.device.createBuffer({
      size: view.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(this.viewProjBuffer.getMappedRange()).set(view);
    this.viewProjBuffer.unmap();
  }

  public resize(width: number, height: number) {
    // Update canvas size
    this.canvas.width = width;
    this.canvas.height = height;

    if (this.context) {
      // Update context configuration
      this.context.configure({
        device: this.device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: 'premultiplied'
      });

      // Create or update depth texture
      this.createDepthTexture();
    }
  }

  private createDepthTexture() {
    // Destroy old texture if it exists
    if (this.depthTexture) this.depthTexture.destroy();

    // Create new depth texture
    this.depthTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height, 1],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
  }

  public updateViewProj(matrix: Float32Array) {
    if (!this.device || !this.viewProjBuffer) return;
    this.device.queue.writeBuffer(this.viewProjBuffer, 0, matrix);
  }

  static isSupported() {
    return navigator.gpu && navigator.gpu.getPreferredCanvasFormat;
  }

  async init(view: Float32Array) {
    await super.init(view);
    // Request adapter
    const adapter = await navigator.gpu!.requestAdapter();
    if (!adapter) {
      throw new Error('No GPU adapter found');
    }

    // Request device
    this.device = await adapter.requestDevice();

    // Get context and configure
    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    this.context.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied'
    });

    // Create view projection buffer
    this.createViewProjBuffer(view);

    // Create depth texture
    this.createDepthTexture();

    this.createEmptyBuffers();

    // Create pipelines
    this.createPipelines();

    // Initialize text rendering (async, non-blocking)
    this.initTextRendering().catch((err: unknown) => {
      console.error('Failed to initialize text rendering:', err);
      this.textEnabled = false;
    });
  }

  private async initTextRendering() {
    try {
      // Load text atlas texture
      const atlasImageResponse = await fetch('text-atlas.png');
      if (!atlasImageResponse.ok) {
        throw new Error('Failed to load text-atlas.png');
      }
      const atlasImageBlob = await atlasImageResponse.blob();
      const atlasImageBitmap = await createImageBitmap(atlasImageBlob);

      // Create texture
      this.atlasTexture = this.device.createTexture({
        size: [atlasImageBitmap.width, atlasImageBitmap.height, 1],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT
      });

      // Write image data to texture
      this.device.queue.copyExternalImageToTexture(
        { source: atlasImageBitmap },
        { texture: this.atlasTexture },
        [atlasImageBitmap.width, atlasImageBitmap.height]
      );

      // Create sampler
      this.atlasSampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge'
      });

      // Create empty glyph buffer BEFORE creating pipeline
      const minGlyphBufferSize = 16 * 4 * 10; // Space for 10 glyphs
      this.glyphBuffer = this.device.createBuffer({
        size: minGlyphBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });

      // Initialize with empty data
      const emptyGlyphData = new Float32Array(minGlyphBufferSize / 4);
      this.device.queue.writeBuffer(this.glyphBuffer, 0, emptyGlyphData);
      this.glyphCount = 0;

      // Create text pipeline AFTER buffer exists
      this.createTextPipeline();

      this.textEnabled = true;
      console.log('Text rendering initialized successfully');
    } catch (error) {
      console.error('Error initializing text rendering:', error);
      this.textEnabled = false;
      throw error;
    }
  }

  private createNodePipeline(
    nodeVertexShader: GPUShaderModule,
    nodeFragmentShader: GPUShaderModule,
    layout: GPUPipelineLayout
  ) {
    this.nodePipeline = this.device.createRenderPipeline({
      layout,
      vertex: {
        module: nodeVertexShader,
        entryPoint: 'main'
      },
      fragment: {
        module: nodeFragmentShader,
        entryPoint: 'main',
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha'
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha'
              }
            }
          }
        ]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
    });
  }

  private createLinkPipeline(
    linkVertexShader: GPUShaderModule,
    linkFragmentShader: GPUShaderModule,
    layout: GPUPipelineLayout
  ) {
    this.linkPipeline = this.device.createRenderPipeline({
      layout,
      vertex: {
        module: linkVertexShader,
        entryPoint: 'main',
        // No vertex buffers needed for procedural geometry
        buffers: []
      },
      fragment: {
        module: linkFragmentShader,
        entryPoint: 'main',
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha'
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha'
              }
            }
          }
        ]
      },
      primitive: {
        topology: 'triangle-strip'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
    });
  }

  private createTextPipeline() {
    // Create shader modules
    const textVertexShader = this.device.createShaderModule({
      label: 'Text Vertex Shader',
      code: textVertexShaderSrc
    });

    const textFragmentShader = this.device.createShaderModule({
      label: 'Text Fragment Shader',
      code: textFragmentShaderSrc
    });

    // Create bind group layout for uniforms and glyph buffer (group 0)
    const textBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' }
        }
      ]
    });

    // Create bind group layout for texture and sampler (group 1)
    const textureBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {}
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {}
        }
      ]
    });

    // Create pipeline layout
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [textBindGroupLayout, textureBindGroupLayout]
    });

    // Create render pipeline
    this.textPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: textVertexShader,
        entryPoint: 'main'
      },
      fragment: {
        module: textFragmentShader,
        entryPoint: 'main',
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha'
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha'
              }
            }
          }
        ]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
    });

    // Create bind group for uniforms and glyph buffer (group 0)
    this.textBindGroup = this.device.createBindGroup({
      layout: textBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.viewProjBuffer }
        },
        {
          binding: 1,
          resource: { buffer: this.glyphBuffer }
        }
      ]
    });

    // Create bind group for texture and sampler (group 1)
    this.textureBindGroup = this.device.createBindGroup({
      layout: textureBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.atlasSampler
        },
        {
          binding: 1,
          resource: this.atlasTexture.createView()
        }
      ]
    });
  }

  /**
   * Create the rendering pipelines
   */
  private createPipelines() {
    // Create shader modules
    const nodeVertexShader = this.device.createShaderModule({
      label: 'Node Vertex Shader',
      code: nodeVertexShaderSrc
    });

    const nodeFragmentShader = this.device.createShaderModule({
      label: 'Node Fragment Shader',
      code: nodeFragmentShaderSrc
    });

    const linkVertexShader = this.device.createShaderModule({
      label: 'Link Vertex Shader',
      code: linkVertexShaderSrc
    });

    const linkFragmentShader = this.device.createShaderModule({
      label: 'Link Fragment Shader',
      code: linkFragmentShaderSrc
    });

    // Create bind group layout
    const bindGroupLayout = this.createBindGroup();

    // Create pipeline layout
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    });

    this.createNodePipeline(
      nodeVertexShader,
      nodeFragmentShader,
      pipelineLayout
    );
    this.createLinkPipeline(
      linkVertexShader,
      linkFragmentShader,
      pipelineLayout
    );
  }

  private createEmptyBuffers() {
    // Minimum buffer size - enough for a handful of nodes and links
    const minNodeBufferSize = 12 * 4 * 10; // Space for 10 nodes
    const minLinkBufferSize = 12 * 4 * 10; // Space for 10 links

    // Create node buffer
    this.nodeBuffer = this.device.createBuffer({
      size: minNodeBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Create link buffer
    this.linkBuffer = this.device.createBuffer({
      size: minLinkBufferSize,
      usage:
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
    });

    // Quad buffer: 4 vertices, 2 floats per vertex
    this.quadBuffer = this.device.createBuffer({
      size: QUAD_VERTICES.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    // Initialize with empty data
    const emptyNodeData = new Float32Array(minNodeBufferSize / 4);
    // Divide by 4 because Float32Array counts elements, not bytes
    const emptyLinkData = new Float32Array(minLinkBufferSize / 4);

    this.device.queue.writeBuffer(this.nodeBuffer, 0, emptyNodeData);
    this.device.queue.writeBuffer(this.linkBuffer, 0, emptyLinkData);
    this.device.queue.writeBuffer(this.quadBuffer, 0, QUAD_VERTICES);

    // Initialize counts to 0
    this.nodeCount = 0;
    this.linkCount = 0;
  }

  private createBindGroup() {
    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' }
        },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' }
        }
      ]
    });

    // Create bind group - this updates this.bindGroup with the new bind group
    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.viewProjBuffer }
        },
        {
          binding: 1,
          resource: { buffer: this.nodeBuffer }
        },
        {
          binding: 2,
          resource: { buffer: this.linkBuffer }
        }
      ]
    });

    return bindGroupLayout;
  }

  upload({
    nodeData,
    nodeCount,
    linkData,
    linkCount,
    glyphData,
    glyphCount
  }: {
    nodeData: Float32Array;
    nodeCount: number;
    linkData: Float32Array;
    linkCount: number;
    glyphData?: Float32Array;
    glyphCount?: number;
  }) {
    this.nodeCount = nodeCount;
    this.linkCount = linkCount;

    let bindGroupNeedsRecreation = false;

    // Create or update node buffer
    if (!this.nodeBuffer || this.nodeBuffer.size < nodeData.byteLength) {
      // If buffer doesn't exist or is too small, create a new one
      if (this.nodeBuffer) this.nodeBuffer.destroy();

      this.nodeBuffer = this.device.createBuffer({
        size: nodeData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });

      bindGroupNeedsRecreation = true;
    }

    // Write data to node buffer
    this.device.queue.writeBuffer(this.nodeBuffer, 0, nodeData);

    // Create or update link buffer
    if (!this.linkBuffer || this.linkBuffer.size < linkData.byteLength) {
      // If buffer doesn't exist or is too small, create a new one
      if (this.linkBuffer) this.linkBuffer.destroy();

      this.linkBuffer = this.device.createBuffer({
        size: linkData.byteLength,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.VERTEX
      });

      bindGroupNeedsRecreation = true;
    }

    // Write data to link buffer
    this.device.queue.writeBuffer(this.linkBuffer, 0, linkData);

    // Recreate the bind group if we've changed any of the buffers
    if (bindGroupNeedsRecreation) this.createBindGroup();

    // Handle text glyph data (optional)
    if (glyphData && glyphCount !== undefined && this.textEnabled) {
      this.glyphCount = glyphCount;

      let textBindGroupNeedsRecreation = false;

      // Create or update glyph buffer
      if (!this.glyphBuffer || this.glyphBuffer.size < glyphData.byteLength) {
        // If buffer doesn't exist or is too small, create a new one
        if (this.glyphBuffer) this.glyphBuffer.destroy();

        this.glyphBuffer = this.device.createBuffer({
          size: glyphData.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        textBindGroupNeedsRecreation = true;
      }

      // Write data to glyph buffer
      this.device.queue.writeBuffer(this.glyphBuffer, 0, glyphData);

      // Recreate text bind group if buffer changed
      if (textBindGroupNeedsRecreation && this.textBindGroup) {
        const textBindGroupLayout = this.textPipeline.getBindGroupLayout(0);
        this.textBindGroup = this.device.createBindGroup({
          layout: textBindGroupLayout,
          entries: [
            {
              binding: 0,
              resource: { buffer: this.viewProjBuffer }
            },
            {
              binding: 1,
              resource: { buffer: this.glyphBuffer }
            }
          ]
        });
      }
    }
  }

  draw() {
    // Skip if we don't have a bind group (means no data has been loaded yet)
    if (!this.bindGroup || !this.nodeBuffer || !this.linkBuffer) return;

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder();
    // Create render pass
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
          storeOp: 'store'
        }
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setBindGroup(0, this.bindGroup);

    // --- Draw links as instanced Bezier strips ---
    passEncoder.setPipeline(this.linkPipeline);
    // No vertex buffer needed for links
    // passEncoder.setVertexBuffer(0, this.quadBuffer); // REMOVE THIS LINE
    // passEncoder.setVertexBuffer(1, this.linkBuffer); // REMOVE THIS LINE

    // Each Bezier curve is tessellated into segmentCount segments, 2 vertices per segment
    //const SEGMENT_COUNT = 80;
    //const VERTICES_PER_EDGE = SEGMENT_COUNT * 2;
    const instanceCount = this.linkCount;
    passEncoder.draw(VERTICES_PER_EDGE, instanceCount);

    // --- Draw nodes as before ---
    passEncoder.setPipeline(this.nodePipeline);
    passEncoder.draw(6, this.nodeCount); // 6 vertices per quad, instanced

    // --- Draw text (after nodes, before ending pass) ---
    if (this.textEnabled && this.glyphCount > 0) {
      passEncoder.setPipeline(this.textPipeline);
      passEncoder.setBindGroup(0, this.textBindGroup);
      passEncoder.setBindGroup(1, this.textureBindGroup);
      passEncoder.draw(6, this.glyphCount, 0, 0); // 6 vertices per glyph quad, instanced
    }

    passEncoder.end();

    // Submit command buffer
    this.device.queue.submit([commandEncoder.finish()]);
  }
}
