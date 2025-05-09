import nodeFragmentShaderSrc from './node.frag.wgsl?raw';
import nodeVertexShaderSrc from './node.vert.wgsl?raw';
import linkFragmentShaderSrc from './link.frag.wgsl?raw';
import linkVertexShaderSrc from './link.vert.wgsl?raw';

export class Renderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private viewProjBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;
  private depthTexture!: GPUTexture;
  private nodePipeline!: GPURenderPipeline;
  private linkPipeline!: GPURenderPipeline;
  private nodeBuffer!: GPUBuffer;
  private linkBuffer!: GPUBuffer;

  protected nodeCount: number = 0;
  protected linkCount: number = 0;

  constructor(protected canvas: HTMLCanvasElement) {}

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
    this.device.queue.writeBuffer(this.viewProjBuffer, 0, matrix);
  }

  static isSupported() {
    return navigator.gpu && navigator.gpu.getPreferredCanvasFormat;
  }

  async init(view: Float32Array) {
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

    // Create node pipeline
    this.nodePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
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

    // Create link pipeline
    this.linkPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: linkVertexShader,
        entryPoint: 'main'
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
        topology: 'triangle-strip',
        stripIndexFormat: 'uint32'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
    });
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
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Initialize with empty data
    const emptyNodeData = new Float32Array(minNodeBufferSize / 4); // Divide by 4 because Float32Array counts elements, not bytes
    const emptyLinkData = new Float32Array(minLinkBufferSize / 4);

    this.device.queue.writeBuffer(this.nodeBuffer, 0, emptyNodeData);
    this.device.queue.writeBuffer(this.linkBuffer, 0, emptyLinkData);

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
    linkCount
  }: {
    nodeData: Float32Array;
    nodeCount: number;
    linkData: Float32Array;
    linkCount: number;
  }) {
    console.log({ nodeData, nodeCount, linkData, linkCount });
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
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });

      bindGroupNeedsRecreation = true;
    }

    // Write data to link buffer
    this.device.queue.writeBuffer(this.linkBuffer, 0, linkData);

    // Recreate the bind group if we've changed any of the buffers
    if (bindGroupNeedsRecreation) {
      this.createBindGroup();
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

    // Draw links first (so they appear behind nodes)
    if (this.linkCount > 0) {
      passEncoder.setPipeline(this.linkPipeline);
      // Draw 40 vertices per curve = 20 segments * 2 vertices per segment
      passEncoder.draw(40, this.linkCount);
    }

    // Draw nodes
    if (this.nodeCount > 0) {
      passEncoder.setPipeline(this.nodePipeline);
      passEncoder.draw(6, this.nodeCount); // 6 vertices per quad, instanced
    }

    passEncoder.end();

    // Submit command buffer
    this.device.queue.submit([commandEncoder.finish()]);
  }
}
