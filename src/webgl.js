import { mat4 } from 'gl-matrix';

/**
 * Weights functions
 */

const layer_1_depth = 16; // Convolution depth
const layer_1_width = 5; // Convolution width

const layer_2_depth = 8;
const layer_2_width = 3;

const reconstruct_width = 3;

function get_conv1_1_weights(raw_weights) {
  var conv1_1_weights = [];

  for (var y = 0; y < layer_1_width; y++) {
    for (var outw = 0; outw < layer_1_depth; outw++) {
      for (var inw = 0; inw < 3; inw++) {
        conv1_1_weights.push(raw_weights["W_conv1_1"][y][0][inw][outw]);
      }
    }
  }

  return conv1_1_weights;
}

function get_conv1_2_weights(raw_weights) {
  var conv1_2_weights = [];

  for (var x = 0; x < layer_1_width; x++) {
    for (var outw = 0; outw < layer_1_depth; outw++) {
      for (var inw = 0; inw < layer_1_depth; inw++) {
        conv1_2_weights.push(raw_weights["W_conv1_2"][0][x][inw][outw]);
      }
    }
  }

  return conv1_2_weights;
}

function get_conv1_biases(raw_weights) {
  return raw_weights["b_conv1"];
}

function get_conv2_1_weights(raw_weights) {
  var conv2_1_weights = [];

  for (var y = 0; y < layer_2_width; y++) {
    for (var outw = 0; outw < layer_2_depth; outw++) {
      for (var inw = 0; inw < layer_1_depth; inw++) {
        conv2_1_weights.push(raw_weights["W_conv2_1"][y][0][inw][outw]);
      }
    }
  }

  return conv2_1_weights;
}

function get_conv2_2_weights(raw_weights) {
  var conv2_2_weights = [];

  for (var x = 0; x < layer_2_width; x++) {
    for (var outw = 0; outw < layer_2_depth; outw++) {
      for (var inw = 0; inw < layer_2_depth; inw++) {
        conv2_2_weights.push(raw_weights["W_conv2_2"][0][x][inw][outw]);
      }
    }
  }

  return conv2_2_weights;
}

function get_conv2_biases(raw_weights) {
  return raw_weights["b_conv2"];
}

/**
 * XXX: These weights organized differently to enable vec4 dot product
 */
function get_reconstruct_weights(raw_weights) {
  var conv_reconstruct_weights = [];

  for (var out_y = 0; out_y < 3; out_y++) {
    for (var out_x = 0; out_x < 3; out_x++) {
      for (var j = 0; j < reconstruct_width; j++) {
        for (var i = 0; i < reconstruct_width; i++) {
          for (var out_pixel = 0; out_pixel < 3; out_pixel++) {
            for (var z = 0; z < layer_2_depth; z++) {
              conv_reconstruct_weights.push(raw_weights["W_reconstruct"][j][i][z][out_y * 9 + out_x * 3 + out_pixel]);
            }
          }
        }
      }
    }
  }

  return conv_reconstruct_weights;
}

function get_reconstruct_biases(raw_weights) {
  return raw_weights["b_reconstruct"];
}

/**
 * Whut
 */

var loaded_count = 0;
// will set to true when video can be copied to texture
var copyVideo = false;

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

function initCopyProgram(gl) {
  var copyFragShader = `#version 300 es
  precision highp float;
  uniform sampler2D originalSampler;

  uniform vec2 videoRes;
  uniform vec4 renderArea;

  layout(location = 0) out vec4 copyOut;

  void main() {
    if (gl_FragCoord[0] < renderArea.x) {
      copyOut = vec4(0.0, 0.0, 0.0, 1.0);
    } else if (gl_FragCoord[0] > renderArea.z) {
      copyOut = vec4(0.0, 0.0, 0.0, 1.0);
    } else if ((gl_FragCoord[1] < renderArea.y) || (gl_FragCoord[1] > renderArea.w)) {
      copyOut = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      copyOut = texture(originalSampler, vec2((gl_FragCoord[0] - renderArea.x) / videoRes.x, 1.0 - ((gl_FragCoord[1] - renderArea.y) / videoRes.y)));
    }
  }
  `;

  console.log(copyFragShader);

  return initShaderProgram(gl, vsSource, copyFragShader);
}

// Symmetrically pad a 2d texture with black
function initPadProgram(gl, padding) {
  var padFragShader = `#version 300 es

  precision highp float;

  uniform sampler2D originalSampler;
  uniform vec2 videoRes;

  ivec2 start = ivec2(${padding}, ${padding});
  layout(location = 0) out vec4 padOut;

  void main() {
    ivec2 end = ivec2(videoRes.x + ${padding}.0, videoRes.y + ${padding}.0);
    ivec2 outC = ivec2(gl_FragCoord[0], gl_FragCoord[1]);

    if (any(lessThan(outC, start)) || any(greaterThanEqual(outC, end))) {
      padOut = vec4(0.0, 0.0, 0.0, 0.0);
    } else {
      float x = gl_FragCoord[0] - 4.0;
      float y = gl_FragCoord[1] - 4.0;
      vec2 coords = vec2(x / videoRes.x, y / videoRes.y);
      padOut = texture(originalSampler, coords) * 255.0;
      // padOut = vec4(x, y, coords.r, coords.g);
    }
  }
  `;

  console.log(padFragShader);

  return initShaderProgram(gl, vsSource, padFragShader);
}


// Vertical conv2d
// in: width x height x 3
// out: width x (height-4) x 16
// kernel size 1x5
function init_conv1_1_program(gl) {
  var coords = [];
  var inputs = [];
  var operations = [];

  for (var i = 0; i < 5; i++) {
    coords.push(`vec2 coords_${i} = vec2(outX / inWidth, (outY + ${i}.0) / inHeight);`);
    inputs.push(`vec4 in${i} = texture(padSampler, coords_${i});`);

    operations.push(`out0.r += dot(in${i}.rgb, weights[${i * layer_1_depth +  0}].rgb);`);
    operations.push(`out0.g += dot(in${i}.rgb, weights[${i * layer_1_depth +  1}].rgb);`);
    operations.push(`out0.b += dot(in${i}.rgb, weights[${i * layer_1_depth +  2}].rgb);`);
    operations.push(`out0.a += dot(in${i}.rgb, weights[${i * layer_1_depth +  3}].rgb);`);
    operations.push(`out1.r += dot(in${i}.rgb, weights[${i * layer_1_depth +  4}].rgb);`);
    operations.push(`out1.g += dot(in${i}.rgb, weights[${i * layer_1_depth +  5}].rgb);`);
    operations.push(`out1.b += dot(in${i}.rgb, weights[${i * layer_1_depth +  6}].rgb);`);
    operations.push(`out1.a += dot(in${i}.rgb, weights[${i * layer_1_depth +  7}].rgb);`);
    operations.push(`out2.r += dot(in${i}.rgb, weights[${i * layer_1_depth +  8}].rgb);`);
    operations.push(`out2.g += dot(in${i}.rgb, weights[${i * layer_1_depth +  9}].rgb);`);
    operations.push(`out2.b += dot(in${i}.rgb, weights[${i * layer_1_depth + 10}].rgb);`);
    operations.push(`out2.a += dot(in${i}.rgb, weights[${i * layer_1_depth + 11}].rgb);`);
    operations.push(`out3.r += dot(in${i}.rgb, weights[${i * layer_1_depth + 12}].rgb);`);
    operations.push(`out3.g += dot(in${i}.rgb, weights[${i * layer_1_depth + 13}].rgb);`);
    operations.push(`out3.b += dot(in${i}.rgb, weights[${i * layer_1_depth + 14}].rgb);`);
    operations.push(`out3.a += dot(in${i}.rgb, weights[${i * layer_1_depth + 15}].rgb);`);
  }

  var conv1_1_shader = `#version 300 es

  precision highp float;

  uniform sampler2D padSampler;
  uniform vec3 weights[${layer_1_width * layer_1_depth}];
  uniform vec2 videoRes;

  layout(location = 0) out vec4 out0;
  layout(location = 1) out vec4 out1;
  layout(location = 2) out vec4 out2;
  layout(location = 3) out vec4 out3;

  void main() {
    out0 = vec4(0.0, 0.0, 0.0, 0.0);
    out1 = vec4(0.0, 0.0, 0.0, 0.0);
    out2 = vec4(0.0, 0.0, 0.0, 0.0);
    out3 = vec4(0.0, 0.0, 0.0, 0.0);
    float outX = float(gl_FragCoord[0]);
    float outY = float(gl_FragCoord[1]);

    float inWidth = videoRes.x + 8.0;
    float inHeight = videoRes.y + 8.0;

    // Coords
${coords.join("\n")}

    // Inputs
${inputs.join("\n")}

    // Operations
${operations.join("\n")}
  }
  `;

  console.log(conv1_1_shader)

  return initShaderProgram(gl, vsSource, conv1_1_shader);
}


// Vertical conv2d
// in: width x height x 8
// out: (width-4) x height x 8
// kernel size 5x1
function init_conv1_2_program(gl) {
  var coords = [];
  var inputs = [];
  var operations = [];

  for (var i = 0; i < layer_1_width; i++) {
    coords.push(`vec2 coords_${i} = vec2((outX + ${i}.0) / inWidth, outY / inHeight);`);

    inputs.push(`vec4 in${i}_0 = texture(layer1Sampler, coords_${i});`);
    inputs.push(`vec4 in${i}_1 = texture(layer2Sampler, coords_${i});`);
    inputs.push(`vec4 in${i}_2 = texture(layer3Sampler, coords_${i});`);
    inputs.push(`vec4 in${i}_3 = texture(layer4Sampler, coords_${i});`);

    operations.push(`out0.r += dot(in${i}_0, weights[${i * layer_1_depth * 4 +  0}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 +  1}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 +  2}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 +  3}]);`);
    operations.push(`out0.g += dot(in${i}_0, weights[${i * layer_1_depth * 4 +  4}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 +  5}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 +  6}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 +  7}]);`);
    operations.push(`out0.b += dot(in${i}_0, weights[${i * layer_1_depth * 4 +  8}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 +  9}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 10}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 11}]);`);
    operations.push(`out0.a += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 12}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 13}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 14}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 15}]);`);
    operations.push(`out1.r += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 16}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 17}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 18}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 19}]);`);
    operations.push(`out1.g += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 20}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 21}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 22}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 23}]);`);
    operations.push(`out1.b += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 24}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 25}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 26}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 27}]);`);
    operations.push(`out1.a += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 28}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 29}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 30}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 31}]);`);
    operations.push(`out2.r += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 32}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 33}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 34}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 35}]);`);
    operations.push(`out2.g += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 36}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 37}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 38}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 39}]);`);
    operations.push(`out2.b += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 40}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 41}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 42}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 43}]);`);
    operations.push(`out2.a += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 44}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 45}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 46}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 47}]);`);
    operations.push(`out3.r += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 48}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 49}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 50}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 51}]);`);
    operations.push(`out3.g += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 52}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 53}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 54}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 55}]);`);
    operations.push(`out3.b += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 56}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 57}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 58}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 59}]);`);
    operations.push(`out3.a += dot(in${i}_0, weights[${i * layer_1_depth * 4 + 60}]) + dot(in${i}_1, weights[${i * layer_1_depth * 4 + 61}]) + dot(in${i}_2, weights[${i * layer_1_depth * 4 + 62}]) + dot(in${i}_3, weights[${i * layer_1_depth * 4 + 63}]);`);
  }

  var conv1_2_shader = `#version 300 es

  precision highp float;
  precision highp sampler2D;

  uniform sampler2D layer1Sampler;
  uniform sampler2D layer2Sampler;
  uniform sampler2D layer3Sampler;
  uniform sampler2D layer4Sampler;

  uniform vec4 weights[${layer_1_width * layer_1_depth * 4}];
  uniform vec4 biases[4];
  uniform vec2 videoRes;

  layout(location = 0) out vec4 out0;
  layout(location = 1) out vec4 out1;
  layout(location = 2) out vec4 out2;
  layout(location = 3) out vec4 out3;

  void main() {
    out0 = vec4(0.0, 0.0, 0.0, 0.0);
    out1 = vec4(0.0, 0.0, 0.0, 0.0);
    out2 = vec4(0.0, 0.0, 0.0, 0.0);
    out3 = vec4(0.0, 0.0, 0.0, 0.0);

    float outX = float(gl_FragCoord[0]);
    float outY = float(gl_FragCoord[1]);

    float inWidth = videoRes.x + 8.0;
    float inHeight = videoRes.y + 4.0;

    // Coords
${coords.join("\n")}

    // Inputs
${inputs.join("\n")}

    // Operations
${operations.join("\n")}

    out0 = max(out0 + biases[0], 0.0);
    out1 = max(out1 + biases[1], 0.0);
    out2 = max(out2 + biases[2], 0.0);
    out3 = max(out3 + biases[3], 0.0);

    // out0 = vec4(weights[${4 * layer_1_depth * 4 +  6}].r, in4_2.r, weights[${4 * layer_1_depth * 4 +  6}].g, in4_2.g);
    // out1 = vec4(weights[${4 * layer_1_depth * 4 +  6}].b, in4_2.b, weights[${4 * layer_1_depth * 4 +  6}].a, in4_2.a);
    // out2 = vec4(weights[${4 * layer_1_depth * 4 +  7}].r, in4_3.r, weights[${4 * layer_1_depth * 4 +  7}].g, in4_3.g);
    // out3 = vec4(weights[${4 * layer_1_depth * 4 +  7}].b, in4_3.b, weights[${4 * layer_1_depth * 4 +  7}].a, in4_3.a);

    // out0 = vec4(coords_0.r, coords_4.g, inWidth, inHeight);
  }
  `;

  console.log(conv1_2_shader)

  return initShaderProgram(gl, vsSource, conv1_2_shader);
}


// Vertical conv2d
// in: width x height x 16
// out: width x (height - 2) x 8
// kernel size 1 x 3
function init_conv2_1_program(gl) {
  var coords = [];
  var inputs = [];
  var operations = [];

  for (var i = 0; i < layer_2_width; i++) {
    coords.push(`vec2 coords_${i} = vec2(outX / inWidth, (outY + ${i}.0) / inHeight);`);
    
    inputs.push(`vec4 in${i}_0 = texture(layer1Sampler, coords_${i});`);
    inputs.push(`vec4 in${i}_1 = texture(layer2Sampler, coords_${i});`);
    inputs.push(`vec4 in${i}_2 = texture(layer3Sampler, coords_${i});`);
    inputs.push(`vec4 in${i}_3 = texture(layer4Sampler, coords_${i});`);

    operations.push(`out0.r += dot(in${i}_0, weights[${i * layer_2_depth * 4 +  0}]) + dot(in${i}_1, weights[${i * layer_2_depth * 4 +  1}]) + dot(in${i}_2, weights[${i * layer_2_depth * 4 +  2}]) + dot(in${i}_3, weights[${i * layer_2_depth * 4 +  3}]);`);
    operations.push(`out0.g += dot(in${i}_0, weights[${i * layer_2_depth * 4 +  4}]) + dot(in${i}_1, weights[${i * layer_2_depth * 4 +  5}]) + dot(in${i}_2, weights[${i * layer_2_depth * 4 +  6}]) + dot(in${i}_3, weights[${i * layer_2_depth * 4 +  7}]);`);
    operations.push(`out0.b += dot(in${i}_0, weights[${i * layer_2_depth * 4 +  8}]) + dot(in${i}_1, weights[${i * layer_2_depth * 4 +  9}]) + dot(in${i}_2, weights[${i * layer_2_depth * 4 + 10}]) + dot(in${i}_3, weights[${i * layer_2_depth * 4 + 11}]);`);
    operations.push(`out0.a += dot(in${i}_0, weights[${i * layer_2_depth * 4 + 12}]) + dot(in${i}_1, weights[${i * layer_2_depth * 4 + 13}]) + dot(in${i}_2, weights[${i * layer_2_depth * 4 + 14}]) + dot(in${i}_3, weights[${i * layer_2_depth * 4 + 15}]);`);
    operations.push(`out1.r += dot(in${i}_0, weights[${i * layer_2_depth * 4 + 16}]) + dot(in${i}_1, weights[${i * layer_2_depth * 4 + 17}]) + dot(in${i}_2, weights[${i * layer_2_depth * 4 + 18}]) + dot(in${i}_3, weights[${i * layer_2_depth * 4 + 19}]);`);
    operations.push(`out1.g += dot(in${i}_0, weights[${i * layer_2_depth * 4 + 20}]) + dot(in${i}_1, weights[${i * layer_2_depth * 4 + 21}]) + dot(in${i}_2, weights[${i * layer_2_depth * 4 + 22}]) + dot(in${i}_3, weights[${i * layer_2_depth * 4 + 23}]);`);
    operations.push(`out1.b += dot(in${i}_0, weights[${i * layer_2_depth * 4 + 24}]) + dot(in${i}_1, weights[${i * layer_2_depth * 4 + 25}]) + dot(in${i}_2, weights[${i * layer_2_depth * 4 + 26}]) + dot(in${i}_3, weights[${i * layer_2_depth * 4 + 27}]);`);
    operations.push(`out1.a += dot(in${i}_0, weights[${i * layer_2_depth * 4 + 28}]) + dot(in${i}_1, weights[${i * layer_2_depth * 4 + 29}]) + dot(in${i}_2, weights[${i * layer_2_depth * 4 + 30}]) + dot(in${i}_3, weights[${i * layer_2_depth * 4 + 31}]);`);
  }

  var conv2_1_shader = `#version 300 es

  precision highp float;

  uniform sampler2D layer1Sampler;
  uniform sampler2D layer2Sampler;
  uniform sampler2D layer3Sampler;
  uniform sampler2D layer4Sampler;
  uniform vec2 videoRes;

  uniform vec4 weights[${layer_2_width * layer_2_depth * 4}];

  layout(location = 0) out vec4 out0;
  layout(location = 1) out vec4 out1;

  void main() {
    out0 = vec4(0.0, 0.0, 0.0, 0.0);
    out1 = vec4(0.0, 0.0, 0.0, 0.0);
    
    float outX = float(gl_FragCoord[0]);
    float outY = float(gl_FragCoord[1]);

    float inWidth = videoRes.x + 4.0;
    float inHeight = videoRes.y + 4.0;

    // Coords
${coords.join("\n")}

    // Inputs
${inputs.join("\n")}

    // Operations
${operations.join("\n")}
  }
  `;

  console.log(conv2_1_shader)

  return initShaderProgram(gl, vsSource, conv2_1_shader);
}

// Vertical conv2d
// in: width x height x 4
// out: (width-2) x height x 4
// kernel size 3 x 1
function init_conv2_2_program(gl) {
  var coords = [];
  var inputs = [];
  var operations = [];

  for (var i = 0; i < 3; i++) {
    coords.push(`vec2 coords_${i} = vec2((outX + ${i}.0) / inWidth, outY / inHeight);`);

    inputs.push(`vec4 in${i}_0 = texture(layer1Sampler, coords_${i});`);
    inputs.push(`vec4 in${i}_1 = texture(layer2Sampler, coords_${i});`);

    operations.push(`out0.r += dot(in${i}_0, weights[${i * 8 * 2 +  0}]) + dot(in${i}_1, weights[${i * 8 * 2 +  1}]);`);
    operations.push(`out0.g += dot(in${i}_0, weights[${i * 8 * 2 +  2}]) + dot(in${i}_1, weights[${i * 8 * 2 +  3}]);`);
    operations.push(`out0.b += dot(in${i}_0, weights[${i * 8 * 2 +  4}]) + dot(in${i}_1, weights[${i * 8 * 2 +  5}]);`);
    operations.push(`out0.a += dot(in${i}_0, weights[${i * 8 * 2 +  6}]) + dot(in${i}_1, weights[${i * 8 * 2 +  7}]);`);
    operations.push(`out1.r += dot(in${i}_0, weights[${i * 8 * 2 +  8}]) + dot(in${i}_1, weights[${i * 8 * 2 +  9}]);`);
    operations.push(`out1.g += dot(in${i}_0, weights[${i * 8 * 2 + 10}]) + dot(in${i}_1, weights[${i * 8 * 2 + 11}]);`);
    operations.push(`out1.b += dot(in${i}_0, weights[${i * 8 * 2 + 12}]) + dot(in${i}_1, weights[${i * 8 * 2 + 13}]);`);
    operations.push(`out1.a += dot(in${i}_0, weights[${i * 8 * 2 + 14}]) + dot(in${i}_1, weights[${i * 8 * 2 + 15}]);`);
  }

  var conv2_2_shader = `#version 300 es

  precision highp float;

  uniform sampler2D layer1Sampler;
  uniform sampler2D layer2Sampler;

  uniform vec4 weights[${layer_2_width * layer_2_depth * 2}];
  uniform vec4 biases[2];
  uniform vec2 videoRes;

  layout(location = 0) out vec4 out0;
  layout(location = 1) out vec4 out1;

  void main() {
    out0 = vec4(0.0, 0.0, 0.0, 0.0);
    out1 = vec4(0.0, 0.0, 0.0, 0.0);

    float outX = float(gl_FragCoord[0]);
    float outY = float(gl_FragCoord[1]);

    float inWidth = videoRes.x + 4.0;
    float inHeight = videoRes.y + 2.0;

    // Coords
${coords.join("\n")}

    // Inputs
${inputs.join("\n")}

    // Operations
${operations.join("\n")}

    out0 = max(out0 + biases[0], 0.0);
    out1 = max(out1 + biases[1], 0.0);
  }
  `;

  console.log(conv2_2_shader)

  return initShaderProgram(gl, vsSource, conv2_2_shader);
}

// sub-pixel convolutional layer
// in width x height x 4
// out (width - 2) * 3 x (height - 2) * 3 x 3
// kernel 3 x 3
function init_reconstruct_program(gl) {
  var coords = [];
  var inputs = [];
  var weights = [];
  var operations = [];

  for (var j = 0; j < 3; j++) {
    for (var i = 0; i < 3; i++) {
      // Todo
      coords.push(`vec2 coords_${j}_${i} = vec2((inX + ${i}.0) / inWidth, (inY + ${j}.0) / inHeight);`);

      inputs.push(`vec4 in_${j}_${i}_0 = texture(layer1Sampler, coords_${j}_${i});`);
      inputs.push(`vec4 in_${j}_${i}_1 = texture(layer2Sampler, coords_${j}_${i});`);
      
      weights.push(`vec4 w_${j}_${i}_0_0 = weights[2 * (iOutY * 81 + iOutX * 27 + ${j * 9 + i * 3}) + 0];`);
      weights.push(`vec4 w_${j}_${i}_0_1 = weights[2 * (iOutY * 81 + iOutX * 27 + ${j * 9 + i * 3}) + 1];`);
      weights.push(`vec4 w_${j}_${i}_1_0 = weights[2 * (iOutY * 81 + iOutX * 27 + ${j * 9 + i * 3}) + 2];`);
      weights.push(`vec4 w_${j}_${i}_1_1 = weights[2 * (iOutY * 81 + iOutX * 27 + ${j * 9 + i * 3}) + 3];`);
      weights.push(`vec4 w_${j}_${i}_2_0 = weights[2 * (iOutY * 81 + iOutX * 27 + ${j * 9 + i * 3}) + 4];`);
      weights.push(`vec4 w_${j}_${i}_2_1 = weights[2 * (iOutY * 81 + iOutX * 27 + ${j * 9 + i * 3}) + 5];`);

      operations.push(`r_val += dot(in_${j}_${i}_0, w_${j}_${i}_0_0) + dot(in_${j}_${i}_1, w_${j}_${i}_0_1);`);
      operations.push(`g_val += dot(in_${j}_${i}_0, w_${j}_${i}_1_0) + dot(in_${j}_${i}_1, w_${j}_${i}_1_1);`);
      operations.push(`b_val += dot(in_${j}_${i}_0, w_${j}_${i}_2_0) + dot(in_${j}_${i}_1, w_${j}_${i}_2_1);`);
    }
  }

  var reconstruct_shader = `#version 300 es

  precision highp float;

  uniform sampler2D originalSampler;
  uniform sampler2D layer1Sampler;
  uniform sampler2D layer2Sampler;
  uniform vec2 videoRes;

  uniform sampler2D maskSampler;

  uniform vec4 weights[${3 * 3 * 3 * 9 * 2}];
  uniform vec3 biases[9];

  out vec4 final_out;

  void main() {
    vec4 out0 = vec4(0.0, 0.0, 0.0, 1.0);
    float r_val = 0.0;
    float g_val = 0.0;
    float b_val = 0.0;

    int iOutX = int(mod(gl_FragCoord[0] - 0.5, 3.0));
    int iOutY = int(mod(gl_FragCoord[1] - 0.5, 3.0));

    float inX = (gl_FragCoord[0] - float(iOutX) - 0.5) / 3.0 + 0.5;
    float inY = (gl_FragCoord[1] - float(iOutY) - 0.5) / 3.0 + 0.5;

    float inWidth = videoRes.x + 2.0;
    float inHeight = videoRes.y + 2.0;

    // Coords
${coords.join("\n")}

    // Inputs
${inputs.join("\n")}

    // Weights
${weights.join("\n")}

    // Operations
${operations.join("\n")}

    out0.rgb = (vec3(r_val, g_val, b_val) + biases[3 * iOutY + iOutX].rgb) / 255.0;
    out0.rgb += texture(originalSampler, vec2(gl_FragCoord[0] / (videoRes.x * 3.0), gl_FragCoord[1] / (videoRes.y * 3.0))).rgb;
    out0.rgb = clamp(out0.rgb, 0.0, 1.0);

    final_out = out0;
  }
  `;

  console.log(reconstruct_shader);

  return initShaderProgram(gl, vsSource, reconstruct_shader);
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

function createTexture(gl, width, height, float) {
  // create to render to
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  {
    // define size and format of level 0
    const level = 0;
    const border = 0;
    const format = gl.RGBA;
    var internalFormat;
    var type;

    if (float) {
      internalFormat = gl.RGBA16F;
      type = gl.FLOAT;
    } else {
      internalFormat = gl.RGBA;
      type = gl.UNSIGNED_BYTE;
    }
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
  const pixel = new Uint8Array([0, 0, 0, 255]); // opaque blue
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
  image.src = "tos_01050.png";
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, programInfo.filters[0]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, programInfo.filters[0]);

  gl.uniform1i(programInfo.samplers[0], 0);

  if (programInfo.textures.length > 0) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, programInfo.textures[1]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, programInfo.filters[1]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, programInfo.filters[1]);
  
    gl.uniform1i(programInfo.samplers[1], 1);
  }

  if (programInfo.textures.length > 1) {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, programInfo.textures[2]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, programInfo.filters[2]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, programInfo.filters[2]);
  
    gl.uniform1i(programInfo.samplers[2], 2);
  }

  if (programInfo.textures.length > 2) {
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, programInfo.textures[3]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, programInfo.filters[3]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, programInfo.filters[3]);
  
    gl.uniform1i(programInfo.samplers[3], 3);
  }

  if (programInfo.textures.length > 3) {
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, programInfo.textures[4]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, programInfo.filters[4]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, programInfo.filters[4]);
  
    gl.uniform1i(programInfo.samplers[4], 4);
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

  if (programInfo.renderArea) {
    gl.uniform4fv(programInfo.uniformLocations.renderAreaLocation, programInfo.renderArea);
  }
  if (programInfo.videoRes) {
    gl.uniform2fv(programInfo.uniformLocations.videoResLocation, programInfo.videoRes);
  }

  {
    const vertexCount = 6;
    const type = gl.UNSIGNED_SHORT;
    const offset = 0;
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  }
}

function resizeCanvas(canvas) {
  // Lookup the size the browser is displaying the canvas.
  //var displayWidth  = Math.floor(canvas.clientWidth * window.devicePixelRatio);
  //var displayHeight = Math.floor(canvas.clientHeight * window.devicePixelRatio);

  var displayWidth  = canvas.clientWidth;
  var displayHeight = canvas.clientHeight;

  // Check if the canvas is not the same size.
  if (canvas.width  != displayWidth ||
      canvas.height != displayHeight) {
 
    // Make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;
  }
}

function fitBoundingBox(w, h, canvasW, canvasH) {
  var left = Math.round((canvasW - w) / 2.0);
  var right = canvasW - left;
  var top = Math.round((canvasH - h) / 2.0);
  var bottom = canvasH - top;

  return [left, top, right, bottom];
}

function scaleToFit(videoWidth, videoHeight, canvasWidth, canvasHeight) {
  var curWidth = videoWidth;
  var curHeight = videoHeight;
  var isVertical = false;

  if (videoHeight > videoWidth) {
    isVertical = true;
    curWidth = videoWidth;
    curHeight = videoHeight;
  }

  var widthScale = canvasWidth / videoWidth;
  var heightScale = canvasHeight / videoHeight;
  var scaleFactor = Math.min(widthScale, heightScale);

  curWidth = Math.ceil(scaleFactor * curWidth);
  curHeight = Math.floor(scaleFactor * curHeight);

  if (isVertical) {
    return [[curHeight, curWidth], fitBoundingBox(curHeight, curWidth, canvasWidth, canvasHeight)];
  }
  return [[curWidth, curHeight], fitBoundingBox(curWidth, curHeight, canvasWidth, canvasHeight)];
}

//
// Start here
//
export function main(player, canvas, options) {
  const video = player.tech().el();
  const gl = canvas.getContext('webgl2');
  var videoHeight = video.videoHeight || 286;
  var videoWidth = video.videoWidth || 640;
  var renderArea = [0, 0, 100, 100];
  var videoRes = [100, 100];

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
  gl.getExtension('OES_texture_half_float') ||
    gl.getExtension('MOZ_OES_texture_half_float') ||
    gl.getExtension('WEBKIT_OES_texture_half_float');
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  gl.getExtension('OES_texture_half_float_linear');

  // Initialize the textures

  // Input
  var input_texture = initTexture(gl);

  // Padded input
  var pad_texture = createTexture(gl, videoWidth + 8, videoHeight + 8, true);

  var conv1_1_texture1 = createTexture(gl, videoWidth + 8, videoHeight + 4, true);
  var conv1_1_texture2 = createTexture(gl, videoWidth + 8, videoHeight + 4, true);
  var conv1_1_texture3 = createTexture(gl, videoWidth + 8, videoHeight + 4, true);
  var conv1_1_texture4 = createTexture(gl, videoWidth + 8, videoHeight + 4, true);

  var conv1_2_texture1 = createTexture(gl, videoWidth + 4, videoHeight + 4, true);
  var conv1_2_texture2 = createTexture(gl, videoWidth + 4, videoHeight + 4, true);
  var conv1_2_texture3 = createTexture(gl, videoWidth + 4, videoHeight + 4, true);
  var conv1_2_texture4 = createTexture(gl, videoWidth + 4, videoHeight + 4, true);

  var conv2_1_texture1 = createTexture(gl, videoWidth + 4, videoHeight + 2, true);
  var conv2_1_texture2 = createTexture(gl, videoWidth + 4, videoHeight + 2, true);

  // W_conv2_2: in 644x288x4 out (w+4)x(h+4)x4
  var conv2_2_texture1 = createTexture(gl, videoWidth + 2, videoHeight + 2, true);
  var conv2_2_texture2 = createTexture(gl, videoWidth + 2, videoHeight + 2, true);

  // W_reconstruct: in 642x288x4 out 1920x858x3
  var reconstruct_texture = createTexture(gl, videoWidth * 3, videoHeight * 3, false);

  console.log("pad program");
  const padProgram = initPadProgram(gl, 4);
  const padProgramInfo = {
    program: padProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(padProgram, 'aVertexPosition'),      
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(padProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(padProgram, 'uModelViewMatrix'),
      videoResLocation: gl.getUniformLocation(padProgram, 'videoRes')
    },
    // 1-1 mapping between samplers and textures
    samplers: [gl.getUniformLocation(padProgram, 'originalSampler')],
    textures: [input_texture],
    filters: [gl.NEAREST],
    videoRes: videoRes
  };


  console.log("conv1_1 program");
  const conv1_1_program = init_conv1_1_program(gl);
  const conv1_1_program_info = {
    program: conv1_1_program,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(conv1_1_program, 'aVertexPosition'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(conv1_1_program, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(conv1_1_program, 'uModelViewMatrix'),
      weightsLocation: gl.getUniformLocation(conv1_1_program, 'weights'),
      videoResLocation: gl.getUniformLocation(conv1_1_program, 'videoRes')
    },
    samplers: [gl.getUniformLocation(conv1_1_program, 'padSampler')],
    textures: [pad_texture],
    filters: [gl.NEAREST],
    weights: get_conv1_1_weights(options.weights),
    rgbWeights: true,
    videoRes: videoRes
  };

  console.log("conv1_2 program");
  const conv1_2_program = init_conv1_2_program(gl);
  const conv1_2_program_info = {
    program: conv1_2_program,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(conv1_2_program, 'aVertexPosition'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(conv1_2_program, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(conv1_2_program, 'uModelViewMatrix'),
      weightsLocation: gl.getUniformLocation(conv1_2_program, 'weights'),
      biasesLocation: gl.getUniformLocation(conv1_2_program, 'biases'),
      videoResLocation: gl.getUniformLocation(conv1_2_program, 'videoRes')
    },
    samplers: [
      gl.getUniformLocation(conv1_2_program, 'layer1Sampler'),
      gl.getUniformLocation(conv1_2_program, 'layer2Sampler'),
      gl.getUniformLocation(conv1_2_program, 'layer3Sampler'),
      gl.getUniformLocation(conv1_2_program, 'layer4Sampler'),
    ],
    textures: [conv1_1_texture1, conv1_1_texture2, conv1_1_texture3, conv1_1_texture4],
    filters: [gl.NEAREST, gl.NEAREST, gl.NEAREST, gl.NEAREST],
    weights: get_conv1_2_weights(options.weights),
    biases: get_conv1_biases(options.weights),
    videoRes: videoRes
  };

  console.log("conv2_1 program");
  const conv2_1_program = init_conv2_1_program(gl, 644, 290);
  const conv2_1_program_info = {
    program: conv2_1_program,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(conv2_1_program, 'aVertexPosition'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(conv2_1_program, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(conv2_1_program, 'uModelViewMatrix'),
      weightsLocation: gl.getUniformLocation(conv2_1_program, 'weights'),
      videoResLocation: gl.getUniformLocation(conv2_1_program, 'videoRes')
    },
    samplers: [
      gl.getUniformLocation(conv2_1_program, 'layer1Sampler'),
      gl.getUniformLocation(conv2_1_program, 'layer2Sampler'),
      gl.getUniformLocation(conv2_1_program, 'layer3Sampler'),
      gl.getUniformLocation(conv2_1_program, 'layer4Sampler')
    ],
    textures: [conv1_2_texture1, conv1_2_texture2, conv1_2_texture3, conv1_2_texture4],
    filters: [gl.NEAREST, gl.NEAREST, gl.NEAREST, gl.NEAREST],
    weights: get_conv2_1_weights(options.weights),
    videoRes: videoRes
  };

  console.log("conv2_2 program");
  const conv2_2_program = init_conv2_2_program(gl, 644, 288);
  const conv2_2_program_info = {
    program: conv2_2_program,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(conv2_2_program, 'aVertexPosition'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(conv2_2_program, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(conv2_2_program, 'uModelViewMatrix'),
      weightsLocation: gl.getUniformLocation(conv2_2_program, 'weights'),
      biasesLocation: gl.getUniformLocation(conv2_2_program, 'biases'),
      videoResLocation: gl.getUniformLocation(conv2_2_program, 'videoRes')
    },
    samplers: [
      gl.getUniformLocation(conv2_2_program, 'layer1Sampler'),
      gl.getUniformLocation(conv2_2_program, 'layer2Sampler')
    ],
    textures: [conv2_1_texture1, conv2_1_texture2],
    filters: [gl.NEAREST, gl.NEAREST],
    weights: get_conv2_2_weights(options.weights),
    biases: get_conv2_biases(options.weights),
    videoRes: videoRes
  };

  console.log("reconstruct program");
  const reconstruct_program = init_reconstruct_program(gl, 642, 288);
  const reconstruct_program_info = {
    program: reconstruct_program,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(reconstruct_program, 'aVertexPosition'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(reconstruct_program, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(reconstruct_program, 'uModelViewMatrix'),
      weightsLocation: gl.getUniformLocation(reconstruct_program, 'weights'),
      biasesLocation: gl.getUniformLocation(reconstruct_program, 'biases'),
      videoResLocation: gl.getUniformLocation(reconstruct_program, 'videoRes')
    },
    samplers: [
      gl.getUniformLocation(reconstruct_program, 'originalSampler'),
      gl.getUniformLocation(reconstruct_program, 'layer1Sampler'),
      gl.getUniformLocation(reconstruct_program, 'layer2Sampler'),
    ],
    textures: [input_texture, conv2_2_texture1, conv2_2_texture2],
    weights: get_reconstruct_weights(options.weights),
    filters: [gl.LINEAR, gl.NEAREST, gl.NEAREST],
    biases: get_reconstruct_biases(options.weights),
    rgbBiases: true,
    videoRes: videoRes
  };

  console.log('Render program');
  const render_program = initCopyProgram(gl);
  var render_program_info = {
    program: render_program,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(render_program, 'aVertexPosition')
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(
        render_program,
        'uProjectionMatrix'
      ),
      modelViewMatrix: gl.getUniformLocation(render_program, 'uModelViewMatrix'),
      renderAreaLocation: gl.getUniformLocation(render_program, 'renderArea'),
      videoResLocation: gl.getUniformLocation(render_program, 'videoRes')
    },
    samplers: [gl.getUniformLocation(render_program, 'originalSampler')],
    textures: [reconstruct_texture],
    filters: [gl.LINEAR],
    renderArea: renderArea,
    videoRes: videoRes
  };

  player.on("loadedmetadata", (x) => {
    console.log("Video res:", video.videoWidth, video.videoHeight);
    videoWidth = video.videoWidth;
    videoHeight = video.videoHeight;

    // Re-create all textures

    // Padded input
    pad_texture = createTexture(gl, videoWidth + 8, videoHeight + 8, true);

    conv1_1_texture1 = createTexture(gl, videoWidth + 8, videoHeight + 4, true);
    conv1_1_texture2 = createTexture(gl, videoWidth + 8, videoHeight + 4, true);
    conv1_1_texture3 = createTexture(gl, videoWidth + 8, videoHeight + 4, true);
    conv1_1_texture4 = createTexture(gl, videoWidth + 8, videoHeight + 4, true);

    conv1_2_texture1 = createTexture(gl, videoWidth + 4, videoHeight + 4, true);
    conv1_2_texture2 = createTexture(gl, videoWidth + 4, videoHeight + 4, true);
    conv1_2_texture3 = createTexture(gl, videoWidth + 4, videoHeight + 4, true);
    conv1_2_texture4 = createTexture(gl, videoWidth + 4, videoHeight + 4, true);

    conv2_1_texture1 = createTexture(gl, videoWidth + 4, videoHeight + 2, true);
    conv2_1_texture2 = createTexture(gl, videoWidth + 4, videoHeight + 2, true);

    conv2_2_texture1 = createTexture(gl, videoWidth + 2, videoHeight + 2, true);
    conv2_2_texture2 = createTexture(gl, videoWidth + 2, videoHeight + 2, true);

    reconstruct_texture = createTexture(gl, videoWidth * 3, videoHeight * 3, false);

    // Update Texture References
    conv1_1_program_info.textures = [pad_texture];
    conv1_2_program_info.textures = [conv1_1_texture1, conv1_1_texture2, conv1_1_texture3, conv1_1_texture4];
    conv2_1_program_info.textures = [conv1_2_texture1, conv1_2_texture2, conv1_2_texture3, conv1_2_texture4];
    conv2_2_program_info.textures = [conv2_1_texture1, conv2_1_texture2];
    reconstruct_program_info.textures = [input_texture, conv2_2_texture1, conv2_2_texture2];
    render_program_info.textures = [reconstruct_texture];
  });

  // Here's where we call the routine that builds all the
  // objects we'll be drawing.
  const buffers = initBuffers(gl);

  // Create and bind the framebuffer
  const pad_fb = gl.createFramebuffer();
  const w_conv1_1_fb = gl.createFramebuffer();
  const w_conv1_2_fb = gl.createFramebuffer();
  const w_conv2_1_fb = gl.createFramebuffer();
  const w_conv2_2_fb = gl.createFramebuffer();
  const w_reconstruct_fb = gl.createFramebuffer();

  var elapsedTime = 0;
  var frameCount = 0;
  var lastTime = new Date().getTime();
  var fps = 0;

  // Draw the scene repeatedly
  function render(now) {
    if (copyVideo) {
      updateTexture(gl, input_texture, video);
    }
    resizeCanvas(canvas);

    var renderSettings = scaleToFit(videoWidth, videoHeight, canvas.width, canvas.height);
    // console.log("renderSettings:", renderSettings);

    padProgramInfo.videoRes = [videoWidth, videoHeight];
    conv1_1_program_info.videoRes = [videoWidth, videoHeight];
    conv1_2_program_info.videoRes = [videoWidth, videoHeight];
    conv2_1_program_info.videoRes = [videoWidth, videoHeight];
    conv2_2_program_info.videoRes = [videoWidth, videoHeight];
    reconstruct_program_info.videoRes = [videoWidth, videoHeight];

    render_program_info.videoRes = renderSettings[0];
    render_program_info.renderArea = renderSettings[1];

    /**
     * PAD INPUT
     */
    gl.bindFramebuffer(gl.FRAMEBUFFER, pad_fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pad_texture, 0);
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0, // gl_FragData[0]
    ]);
    gl.viewport(0, 0, videoWidth + 8, videoHeight + 8);

    drawScene(gl, padProgramInfo, buffers);

    /*
    console.log("PADDED");
    var w = videoWidth + 8;
    var h = videoHeight + 8;
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    var pixels0 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels0);

    for (var readY = 99; readY < 100; readY++) {
      for (var readX = 99; readX < 107; readX++) {
        var vals = [];
        vals.push(pixels0[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 3]);
        console.log(`padded ${readY}_${readX}`, vals);
      }
    }
    */

    // Apply W_conv1_1

    gl.bindFramebuffer(gl.FRAMEBUFFER, w_conv1_1_fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, conv1_1_texture1, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, conv1_1_texture2, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, conv1_1_texture3, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, conv1_1_texture4, 0);
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3
    ]);
    gl.viewport(0, 0, videoWidth + 8, videoHeight + 4);

    drawScene(gl, conv1_1_program_info, buffers);

    /*
    console.log("CONV1_1");
    var w = videoWidth + 8;
    var h = videoHeight + 4;
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    var pixels0 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    var pixels1 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels1);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    var pixels2 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels2);
    gl.readBuffer(gl.COLOR_ATTACHMENT3);
    var pixels3 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels3);

    for (var readY = 99; readY < 100; readY++) {
      for (var readX = 99; readX < 107; readX++) {
        var vals = [];
        vals.push(pixels0[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 3]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 3]);
        vals.push(pixels2[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels2[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels2[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels2[readY * w * 4 + readX * 4 + 3]);
        vals.push(pixels3[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels3[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels3[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels3[readY * w * 4 + readX * 4 + 3]);
        console.log(`conv1_1 ${readY}_${readX}`, vals);
      }
    }
    */

    // Apply W_conv1_2, relu and bias
    // in: 648x290x8
    // out: 644x290x8

    gl.bindFramebuffer(gl.FRAMEBUFFER, w_conv1_2_fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, conv1_2_texture1, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, conv1_2_texture2, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, conv1_2_texture3, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, conv1_2_texture4, 0);
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0,
      gl.COLOR_ATTACHMENT1,
      gl.COLOR_ATTACHMENT2,
      gl.COLOR_ATTACHMENT3,
    ]);
    gl.viewport(0, 0, videoWidth + 4, videoHeight + 4);

    drawScene(gl, conv1_2_program_info, buffers);

    /*
    console.log("CONV1_2");
    var w = videoWidth + 4;
    var h = videoHeight + 4;
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    var pixels0 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    var pixels1 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels1);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    var pixels2 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels2);
    gl.readBuffer(gl.COLOR_ATTACHMENT3);
    var pixels3 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels3);

    for (var readY = 99; readY < 100; readY++) {
      for (var readX = 99; readX < 107; readX++) {
        var vals = [];
        vals.push(pixels0[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 3]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 3]);
        vals.push(pixels2[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels2[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels2[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels2[readY * w * 4 + readX * 4 + 3]);
        vals.push(pixels3[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels3[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels3[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels3[readY * w * 4 + readX * 4 + 3]);
        console.log(`conv1_2 ${readY}_${readX}`, vals);
      }
    }
    */

    // Apply W_conv2_1
    // in: 644x290x8
    // out: 644x288x4

    gl.bindFramebuffer(gl.FRAMEBUFFER, w_conv2_1_fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, conv2_1_texture1, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, conv2_1_texture2, 0);
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0,
      gl.COLOR_ATTACHMENT1,
    ]);
    gl.viewport(0, 0, videoWidth + 4, videoHeight + 2);

    drawScene(gl, conv2_1_program_info, buffers);

    /*
    console.log("CONV2_1");
    var w = videoWidth + 4;
    var h = videoHeight + 2;
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    var pixels0 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    var pixels1 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels1);

    for (var readY = 99; readY < 100; readY++) {
      for (var readX = 99; readX < 107; readX++) {
        var vals = [];
        vals.push(pixels0[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 3]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 3]);
        console.log(`conv2_1 ${readY}_${readX}`, vals);
      }
    }
    */

    // Apply W_conv2_2, relu and bias
    // in: 644x288x4
    // out: 642x288x4

    gl.bindFramebuffer(gl.FRAMEBUFFER, w_conv2_2_fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, conv2_2_texture1, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, conv2_2_texture2, 0);
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0,
      gl.COLOR_ATTACHMENT1,
    ]);
    gl.viewport(0, 0, videoWidth + 2, videoHeight + 2);

    drawScene(gl, conv2_2_program_info, buffers);

    /*
    console.log("CONV2_2");
    var w = videoWidth + 2;
    var h = videoHeight + 2;
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    var pixels0 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    var pixels1 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels1);

    for (var readY = 99; readY < 100; readY++) {
      for (var readX = 99; readX < 107; readX++) {
        var vals = [];
        vals.push(pixels0[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 3]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels1[readY * w * 4 + readX * 4 + 3]);
        console.log(`conv2_2 ${readY}_${readX}`, vals);
      }
    }
    */


    // Reconstruct
    // in: 642x288x4
    // out: 640x286x27
    // out: 1920x858x3 (hard)

    // Scale the current texture
    // Sum and clamp
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, w_reconstruct_fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, reconstruct_texture, 0);
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0, // gl_FragData[0]
    ]);
    gl.viewport(0, 0, videoWidth * 3, videoHeight * 3);

    drawScene(gl, reconstruct_program_info, buffers);

    /*
    console.log("Reconstruct");
    var w = videoWidth * 3;
    var h = videoHeight * 3;
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    var pixels0 = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels0);

    for (var readY = 99; readY < 102; readY++) {
      for (var readX = 99; readX < 102; readX++) {
        var vals = [];
        vals.push(pixels0[readY * w * 4 + readX * 4 + 0]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 1]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 2]);
        vals.push(pixels0[readY * w * 4 + readX * 4 + 3]);
        console.log(`reconstruct ${readY}_${readX}`, vals);
      }
    }
    */


    /**
     * Render Final Video
     */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    drawScene(gl, render_program_info, buffers);

    var now = new Date().getTime();
    frameCount++;
    elapsedTime += now - lastTime;

    lastTime = now;
    if(elapsedTime >= 1000) {
      fps = frameCount;
      frameCount = 0;
      elapsedTime -= 1000;

      console.log("fps", fps);
    }

    // Do it again!
    if (loaded_count < 1) {
      requestAnimationFrame(render);
    }
  }
  requestAnimationFrame(render);
}
