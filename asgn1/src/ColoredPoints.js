// ColoredPoint.js (c) 2012 matsuda
// Vertex shader program
var VSHADER_SOURCE = `
  attribute vec4 a_Position;
  uniform float u_Size;
  void main() {
    gl_Position = a_Position;
    gl_PointSize = u_Size;
  }`;

// Fragment shader program
var FSHADER_SOURCE = `
  precision mediump float;
  uniform vec4 u_FragColor;\n
  void main() {
    gl_FragColor = u_FragColor;
  }`;

//Global Variables
let canvas;
var gl;
let a_Position;
let u_FragColor;
let u_Size;

function setupWebGL() {
  // Retrieve <canvas> element
  canvas = document.getElementById("webgl");

  // Get the rendering context for WebGL
  //  gl = getWebGLContext(canvas);
  gl = canvas.getContext("webgl", (preserveDrawingBuffer = true));
  if (!gl) {
    console.log("Failed to get the rendering context for WebGL");
    return;
  }
}

function connectVariablesToGLSL() {
  // Initialize shaders
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log("Failed to intialize shaders.");
    return;
  }

  // // Get the storage location of a_Position
  a_Position = gl.getAttribLocation(gl.program, "a_Position");
  if (a_Position < 0) {
    console.log("Failed to get the storage location of a_Position");
    return;
  }

  // Get the storage location of u_FragColor
  u_FragColor = gl.getUniformLocation(gl.program, "u_FragColor");
  if (!u_FragColor) {
    console.log("Failed to get the storage location of u_FragColor");
    return;
  }

  // Get the storage location of u_Size
  u_Size = gl.getUniformLocation(gl.program, "u_Size");
  if (!u_Size) {
    console.log("Failed to get the storage location of u_Size");
    return;
  }
}

//Constants
const POINT = 0;
const TRIANGLE = 1;
const CIRCLE = 2;

//Globals related UI elemnts
let g_selectedColor = [1.0, 1.0, 1.0, 1.0];
let g_selectedSize = 5.0;
let g_selectedType = POINT;
let g_circle_seg_size = 5.0;
let g_sprayRadius = 0.1;
let g_sprayFill = 5;
let g_sprayOn = false;
let g_dogDrawn = false;

//Set up actions for HTML UI elements
function addActionsForHTMLUI() {
  //Button Events (Shape Type)
  document.getElementById("green").onclick = function () {
    console.log("Green button clicked");
    g_selectedColor = [0.0, 1.0, 0.0, 1.0];
  };
  document.getElementById("red").onclick = function () {
    console.log("Red button clicked");
    g_selectedColor = [1.0, 0.0, 0.0, 1.0];
  };

  document.getElementById("clear").onclick = function () {
    console.log("Clear button clicked");
    g_shapesList = [];
    g_dogDrawn = false;
    document.getElementById("dogRef").style.display = "none";
    renderAllShapes();
  };

  document.getElementById("point").onclick = function () {
    console.log("Point button clicked");
    g_selectedType = POINT;
  };

  document.getElementById("triangle").onclick = function () {
    console.log("Trianlge button clicked");
    g_selectedType = TRIANGLE;
  };

  document.getElementById("circle").onclick = function () {
    console.log("Circle button clicked");
    g_selectedType = CIRCLE;
  };

  document.getElementById("redSlide").addEventListener("mouseup", function () {
    console.log("Red slider moved");
    g_selectedColor[0] = this.value / 100;
  });

  document
    .getElementById("greenSlide")
    .addEventListener("mouseup", function () {
      console.log("Green slider moved");
      g_selectedColor[1] = this.value / 100;
    });

  document.getElementById("blueSlide").addEventListener("mouseup", function () {
    console.log("Blue slider moved");
    g_selectedColor[2] = this.value / 100;
  });

  document.getElementById("sizeSlide").addEventListener("mouseup", function () {
    console.log("Size slider moved");
    g_selectedSize = this.value;
  });

  document
    .getElementById("circle_seg_size")
    .addEventListener("mouseup", function () {
      console.log("Circle Segment Size slider moved");
      g_circle_seg_size = this.value;
    });

  document.getElementById("sprayOn").onclick = function () {
    console.log("Spray On button clicked");
    g_sprayOn = true;
  };

  document.getElementById("sprayOff").onclick = function () {
    console.log("Spray Off button clicked");
    g_sprayOn = false;
  };

  document.getElementById("sprayRadius").addEventListener("mouseup", function () {
    console.log("Spray Radius slider moved");
    g_sprayRadius = this.value / 100;
  });

  document.getElementById("sprayFill").addEventListener("mouseup", function () {
    console.log("Spray Fill slider moved");
    g_sprayFill = parseInt(this.value);
  });

  document.getElementById("drawDog").onclick = function () {
    g_dogDrawn = true;
    document.getElementById("dogRef").style.display = "inline";
    renderAllShapes();
  };
}

function main() {
  setupWebGL();

  connectVariablesToGLSL();

  addActionsForHTMLUI();

  // Register function (event handler) to be called on a mouse press
  //  canvas.onmousedown = click;
  canvas.onmousemove = function (ev) {
    if (ev.buttons == 1) {
      click(ev);
    }
  };
  // Specify the color for clearing <canvas>
  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  // Clear <canvas>
  gl.clear(gl.COLOR_BUFFER_BIT);
}

//Draw every shape that is supposed to be in the canvas
function renderAllShapes() {
  var startTime = performance.now();
  // Clear <canvas>
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (g_dogDrawn) drawDog();

  var len = g_shapesList.length;

  for (var i = 0; i < len; i++) {
    g_shapesList[i].render();
  }

  var duration = performance.now() - startTime;
  sendTextToHTTML(
    "numdot: " +
      len +
      Math.floor(duration) +
      " fps: " +
      Math.floor(1000 / duration),
    "numdot",
  );
}
var g_shapesList = [];


function sendTextToHTTML(text, htmlID) {
  var htmlElem = document.getElementById(htmlID);
  if (!htmlElem) {
    console.log("Failed to get the HTML element");
    return;
  }
  htmlElem.innerText = text;
}

// var g_points = []; // The array for the position of a mouse press
// var g_colors = []; // The array to store the color of a point
// var g_sizes = [];

function click(ev) {
  [x, y] = convertCoordinatesEventToGL(ev);

  let positions = [[x, y, g_selectedSize]];
  if (g_sprayOn) {
    positions = [];
    for (let i = 0; i < g_sprayFill; i++) {
      let angle = Math.random() * 2 * Math.PI;
      let dist = g_sprayRadius * Math.sqrt(Math.random());
      let t = dist / g_sprayRadius;
      positions.push([x + dist * Math.cos(angle), y + dist * Math.sin(angle), g_selectedSize * (1 - 0.75 * t)]);
    }
  }

  for (let [px, py, psize] of positions) {
    let point;
    if (g_selectedType == POINT) {
      point = new Point();
    } else if (g_selectedType == TRIANGLE) {
      point = new Triangle();
    } else if (g_selectedType == CIRCLE) {
      point = new Circle();
    }

    point.position = [px, py];
    point.color = g_selectedColor.slice();
    point.size = psize;
    point.segments = g_circle_seg_size;
    g_shapesList.push(point);
    console.log(`New ${point.constructor.name} created — position: (${px.toFixed(3)}, ${py.toFixed(3)}), size: ${Number(psize).toFixed(1)}, color: rgba(${point.color.map(c => c.toFixed(2)).join(', ')})`);
  }

  //  // Store the coordinates to g_points array
  //  g_points.push([x, y]);
  //
  //  // Store the coordinates to g_points array
  //  g_colors.push(g_selectedColor.slice());
  //
  //  g_sizes.push(g_selectedSize);

  //  if (x >= 0.0 && y >= 0.0) {
  //    // First quadrant
  //    g_colors.push([1.0, 0.0, 0.0, 1.0]); // Red
  //  } else if (x < 0.0 && y < 0.0) {
  //    // Third quadrant
  //    g_colors.push([0.0, 1.0, 0.0, 1.0]); // Green
  //  } else {
  //    // Others
  //    g_colors.push([1.0, 1.0, 1.0, 1.0]); // White
  //  }

  renderAllShapes();
}

// Extract the event click and return it in WebGL coordinates
function convertCoordinatesEventToGL(ev) {
  var x = ev.clientX; // x coordinate of a mouse pointer
  var y = ev.clientY; // y coordinate of a mouse pointer
  var rect = ev.target.getBoundingClientRect();

  x = (x - rect.left - canvas.width / 2) / (canvas.width / 2);
  y = (canvas.height / 2 - (y - rect.top)) / (canvas.height / 2);

  return [x, y];
}
