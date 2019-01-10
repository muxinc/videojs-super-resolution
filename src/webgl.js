import { mat4 } from 'gl-matrix';

/**
 * Whut
 */

var loaded_count = 0;
// will set to true when video can be copied to texture
var copyVideo = false;
var filterActive = true;

/**
 * Utility functions
 */

// Vertex shader program
var vsSource = `#version 300 es
    in vec4 aVertexPosition;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    void main(void) {
        gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    }
`;

// creates a shader of the given type, uploads the source and compiles it.
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  // Send the source to the shader object
  gl.shaderSource(shader, source);

  // Compile the shader program
  gl.compileShader(shader);

  // See if it compiled successfully
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(
      'An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader)
    );
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

// Initialize a shader program, so WebGL knows how to draw our data
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert(
      'Unable to initialize the shader program: ' +
        gl.getProgramInfoLog(shaderProgram)
    );
    return null;
  }

  return shaderProgram;
}

/**
 * WebGL Shaders
 */

function initInvertProgram(gl, width, height) {
  var copyFragShader = `#version 300 es

  precision highp float;

  uniform sampler2D originalSampler;
  layout(location = 0) out vec4 copyOut;

  void main() {
    copyOut.a = 1.0;
    vec4 colors = texture(originalSampler, vec2(gl_FragCoord[0] / ${width}.0, gl_FragCoord[1] / ${height}.0));
    copyOut.rgb = vec3(1.0 - colors.r, 1.0 - colors.g, 1.0 - colors.b);
  }
  `;

  console.log(copyFragShader);

  return initShaderProgram(gl, vsSource, copyFragShader);
}

function initCopyProgram(gl, width, height) {
  var copyFragShader = `#version 300 es
  precision highp float;
  uniform sampler2D originalSampler;
  layout(location = 0) out vec4 copyOut;
  void main() {
    copyOut = texture(originalSampler, vec2(gl_FragCoord[0] / ${width}.0, 1.0 - gl_FragCoord[1] / ${height}.0));
  }
  `;

  console.log(copyFragShader);

  return initShaderProgram(gl, vsSource, copyFragShader);
}

// initBuffers
function initBuffers(gl) {
  // Create a buffer for the cube's vertex positions.
  const positionBuffer = gl.createBuffer();

  // Select the positionBuffer as the one to apply buffer
  // operations to from here out.

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // Now create an array of positions for the cube.

  const positions = [
    // Simple square
    -1.0,
    -1.0,
    1.0,
    1.0,
    -1.0,
    1.0,
    1.0,
    1.0,
    1.0,
    -1.0,
    1.0,
    1.0
  ];

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  // Build the element array buffer; this specifies the indices
  // into the vertex arrays for each face's vertices.

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

  const indices = [
    2,
    0,
    3,
    1,
    0,
    2 // front
  ];

  // Now send the element array to GL
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );

  return {
    position: positionBuffer,
    indices: indexBuffer
  };
}

function createTexture(gl, width, height, nearest) {
  // create to render to
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  {
    // define size and format of level 0
    const level = 0;
    const internalFormat = gl.RGBA32F;
    const border = 0;
    const format = gl.RGBA;
    const type = gl.FLOAT;
    const data = null;
    gl.texImage2D(
      gl.TEXTURE_2D,
      level,
      internalFormat,
      width,
      height,
      border,
      format,
      type,
      data
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (nearest) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
  }

  return texture;
}

// Initialize a texture and load an image.
// When the image finished loading copy it into the texture.
function initTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 1;
  const height = 1;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const pixel = new Uint8Array([0, 0, 255, 255]); // opaque blue
  gl.texImage2D(
    gl.TEXTURE_2D,
    level,
    internalFormat,
    width,
    height,
    border,
    srcFormat,
    srcType,
    pixel
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  /*
  const image = new Image();
  image.onload = function() {
    loaded_count++;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  srcFormat, srcType, image);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  };
  image.src = "test_data/tos_1700_360p.png";
  */

  return texture;
}

function updateTexture(gl, texture, video) {
  const level = 0;
  const internalFormat = gl.RGBA;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    level,
    internalFormat,
    srcFormat,
    srcType,
    video
  );
}

// Draw the scene.
function drawScene(gl, programInfo, buffers, texture) {
  gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
  gl.clearDepth(1.0); // Clear everything
  gl.enable(gl.DEPTH_TEST); // Enable depth testing
  gl.depthFunc(gl.LEQUAL); // Near things obscure far things

  // Clear the canvas before we start drawing on it.
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Create a perspective matrix, a special matrix that is
  // used to simulate the distortion of perspective in a camera.
  // Our field of view is 45 degrees, with a width/height
  // ratio that matches the display size of the canvas
  // and we only want to see objects between 0.1 units
  // and 100 units away from the camera.

  const zNear = 0.1;
  const zFar = 100.0;
  const projectionMatrix = mat4.create();

  mat4.ortho(projectionMatrix, -1.0, 1.0, 1.0, -1.0, zNear, zFar);

  // Set the drawing position to the "identity" point, which is
  // the center of the scene.
  const modelViewMatrix = mat4.create();

  // Now move the drawing position a bit to where we want to
  // start drawing the square.

  mat4.translate(
    modelViewMatrix, // destination matrix
    modelViewMatrix, // matrix to translate
    [-0.0, 0.0, -6.0]
  ); // amount to translate

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, modelViewMatrix);
  mat4.transpose(normalMatrix, normalMatrix);

  // Tell WebGL how to pull out the positions from the position
  // buffer into the vertexPosition attribute
  {
    const numComponents = 3;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(
      programInfo.attribLocations.vertexPosition,
      numComponents,
      type,
      normalize,
      stride,
      offset
    );
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
  }

  // Tell WebGL which indices to use to index the vertices
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);

  // Tell WebGL to use our program when drawing
  gl.useProgram(programInfo.program);

  // Set the shader uniforms
  gl.uniformMatrix4fv(
    programInfo.uniformLocations.projectionMatrix,
    false,
    projectionMatrix
  );
  gl.uniformMatrix4fv(
    programInfo.uniformLocations.modelViewMatrix,
    false,
    modelViewMatrix
  );

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, programInfo.textures[0]);
  gl.uniform1i(programInfo.samplers[0], 0);

  if (programInfo.textures.length > 0) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, programInfo.textures[1]);
    gl.uniform1i(programInfo.samplers[1], 1);
  }

  if (programInfo.textures.length > 1) {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, programInfo.textures[2]);
    gl.uniform1i(programInfo.samplers[2], 2);
  }

  if (programInfo.weights) {
    if (programInfo.rgbWeights) {
      gl.uniform3fv(
        programInfo.uniformLocations.weightsLocation,
        programInfo.weights
      );
    } else {
      gl.uniform4fv(
        programInfo.uniformLocations.weightsLocation,
        programInfo.weights
      );
    }
  }

  if (programInfo.biases) {
    if (programInfo.rgbBiases) {
      gl.uniform3fv(
        programInfo.uniformLocations.biasesLocation,
        programInfo.biases
      );
    } else {
      gl.uniform4fv(
        programInfo.uniformLocations.biasesLocation,
        programInfo.biases
      );
    }
  }

  {
    const vertexCount = 6;
    const type = gl.UNSIGNED_SHORT;
    const offset = 0;
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  }
}

//
// Start here
//
export function main(player, canvas) {
  const video = player.tech().el();
  const gl = canvas.getContext('webgl2');
  const height = canvas.offsetHeight;
  const width = canvas.offsetWidth;

  player.on('playing', () => {
    copyVideo = true;
  });

  player.on(['pause', 'ended'], () => {
    copyVideo = false;
  });

  // If we don't have a GL context, give up now
  if (!gl) {
    alert(
      'Unable to initialize WebGL. Your browser or machine may not support it.'
    );
    return;
  }

  var ext =
    gl.getExtension('OES_texture_float') ||
    gl.getExtension('MOZ_OES_texture_float') ||
    gl.getExtension('WEBKIT_OES_texture_float');
  gl.getExtension('EXT_color_buffer_float');

  // Initialize the textures

  // Input
  const input_texture = initTexture(gl);

  // W_reconstruct: in 642x288x4 out 1920x858x3
  const invert_texture = createTexture(gl, width, height, true);

  console.log('Invert program');
  const invert_program = initInvertProgram(gl, width, height);
  const invert_program_info = {
    program: invert_program,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(invert_program, 'aVertexPosition')
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(
        invert_program,
        'uProjectionMatrix'
      ),
      modelViewMatrix: gl.getUniformLocation(invert_program, 'uModelViewMatrix')
    },
    samplers: [gl.getUniformLocation(invert_program, 'originalSampler')],
    textures: [input_texture]
  };

  console.log('Render program');
  const render_program = initCopyProgram(gl, width, height);
  const render_program_info = {
    program: render_program,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(render_program, 'aVertexPosition')
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(
        render_program,
        'uProjectionMatrix'
      ),
      modelViewMatrix: gl.getUniformLocation(render_program, 'uModelViewMatrix')
    },
    samplers: [gl.getUniformLocation(render_program, 'originalSampler')],
    textures: [invert_texture]
  };

  // Here's where we call the routine that builds all the
  // objects we'll be drawing.
  const buffers = initBuffers(gl);

  // Create and bind the framebuffer
  const invert_fb = gl.createFramebuffer();

  var elapsedTime = 0;
  var frameCount = 0;
  var lastTime = new Date().getTime();

  // Draw the scene repeatedly
  function render(now) {
    if (copyVideo) {
      updateTexture(gl, input_texture, video);
    }

    gl.bindTexture(gl.TEXTURE_2D, input_texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindFramebuffer(gl.FRAMEBUFFER, invert_fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      invert_texture,
      0
    );
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0 // gl_FragData[0]
    ]);
    gl.viewport(0, 0, width, height);

    drawScene(gl, invert_program_info, buffers);

    gl.bindTexture(gl.TEXTURE_2D, invert_texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);

    drawScene(gl, render_program_info, buffers);

    var now = new Date().getTime();
    frameCount++;
    elapsedTime += now - lastTime;

    lastTime = now;

    // Do it again!
    if (loaded_count < 1) {
      requestAnimationFrame(render);
    }
  }
  requestAnimationFrame(render);
}
