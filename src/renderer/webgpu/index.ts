import nodeFragmentShaderSrc from './node.frag.wgsl?raw';
import nodeVertexShaderSrc from './node.vert.wgsl?raw';
import linkFragmentShaderSrc from './link.frag.wgsl?raw';
import linkVertexShaderSrc from './link.vert.wgsl?raw';
import { BaseRenderer } from '../base';
import { LINK_STRIDE, VERTICES_PER_EDGE } from '../../constants';

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

  protected nodeCount: number = 0;
  protected linkCount: number = 0;

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
        buffers: [
          {
            // Quad geometry (per-vertex)
            arrayStride: 2 * 4,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
            stepMode: 'vertex'
          },
          {
            // Per-link instance data
            arrayStride: LINK_STRIDE * 4,
            stepMode: 'instance',
            attributes: [
              // Adjust these attributes to match your WGSL shader's expectations
              { shaderLocation: 1, offset: 0, format: 'float32x4' } // e.g. source/target positions
              // Add more attributes as needed for color, thickness, etc.
            ]
          }
        ]
      },
      fragment: {
        module: linkFragmentShader,
        entryPoint: 'main',
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
            // Add blending configuration for links if needed
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
        stripIndexFormat: undefined // Not needed for quad strip
      },
      // Add depthStencil configuration to fix the error
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
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
    linkCount
  }: {
    nodeData: Float32Array;
    nodeCount: number;
    linkData: Float32Array;
    linkCount: number;
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

    // --- Draw links as instanced quads ---
    passEncoder.setPipeline(this.linkPipeline);
    passEncoder.setVertexBuffer(0, this.quadBuffer); // quad geometry
    passEncoder.setVertexBuffer(1, this.linkBuffer); // per-link instance data

    // Calculate the total number of segments across all links
    // Each link has (VERTICES_PER_EDGE - 1) segments
    // Calculate how many instances we can safely draw based on buffer size
    // Each instance data entry is LINK_STRIDE * 4 bytes
    const maxInstancesInBuffer = Math.floor(
      this.linkBuffer.size / (LINK_STRIDE * 4)
    );

    // Instead of multiplying by (VERTICES_PER_EDGE - 1), let's just use the actual
    // number of instances we can fit in the buffer
    const instanceCount = Math.min(this.linkCount, maxInstancesInBuffer);
    console.log(
      `Drawing ${instanceCount} link instances (max: ${maxInstancesInBuffer}, buffer size: ${this.linkBuffer.size} bytes)`
    );

    // Draw the segments as instanced quads
    passEncoder.draw(QUAD_VERTEX_COUNT, instanceCount);

    // --- Draw nodes as before ---
    passEncoder.setPipeline(this.nodePipeline);
    passEncoder.draw(6, this.nodeCount); // 6 vertices per quad, instanced

    passEncoder.end();

    // Submit command buffer
    this.device.queue.submit([commandEncoder.finish()]);
  }
}
