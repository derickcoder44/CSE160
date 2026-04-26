var VSHADER_SOURCE = `
  attribute vec4 a_Position;
  uniform mat4 u_GlobalRotation;
  uniform mat4 u_ModelMatrix;
  void main() {
    gl_Position = u_GlobalRotation * u_ModelMatrix * a_Position;
  }
`;

var FSHADER_SOURCE = `
  precision mediump float;
  uniform vec4 u_FragColor;
  void main() {
    gl_FragColor = u_FragColor;
  }
`;

var canvas, gl;
var a_Position;
var u_FragColor, u_ModelMatrix, u_GlobalRotation;

var g_cubeVertBuf, g_cubeIdxBuf;
var g_cylVertBuf, g_cylVertCount;

var _CUBE_VERTS = new Float32Array([
  -0.5,-0.5, 0.5,   0.5,-0.5, 0.5,  -0.5, 0.5, 0.5,   0.5, 0.5, 0.5,
  -0.5,-0.5,-0.5,   0.5,-0.5,-0.5,  -0.5, 0.5,-0.5,   0.5, 0.5,-0.5
]);
var _CUBE_IDXS = new Uint8Array([
  0,1,2, 1,3,2,
  1,5,3, 5,7,3,
  5,4,7, 4,6,7,
  4,0,6, 0,2,6,
  2,3,6, 3,7,6,
  4,5,0, 5,1,0
]);

var g_globalAngleY = 0;
var g_globalAngleX = 0;
var g_mouseDown = false;
var g_mouseLastX = 0, g_mouseLastY = 0;

var g_animOn = false;
var g_time = 0;
var g_isPoked = false;
var g_pokeStart = 0;

var g_headAngleY = 0;
var g_trunk1Angle = 10;
var g_trunk2Angle = 15;
var g_trunk3Angle = 20;
var g_earAngle = -25;

// 4 legs: 0=FR, 1=FL, 2=BR, 3=BL
var g_legThigh = [0, 0, 0, 0];
var g_legCalf  = [0, 0, 0, 0];
var g_legFoot  = [0, 0, 0, 0];

var g_tail1Angle = 55;
var g_tail2Angle = 10;
var g_tailSwayAngle = 0;

var g_lastFrameMs = performance.now();
var g_fps = 0;

function main() {
  setupWebGL();
  connectVariablesToGLSL();
  initCubeBuffer();
  initCylinderBuffer();
  addActionsForHTMLUI();
  buildJointSliders();

  gl.clearColor(0.12, 0.12, 0.2, 1.0);
  gl.enable(gl.DEPTH_TEST);

  tick();
}

function setupWebGL() {
  canvas = document.getElementById('webgl');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) { console.log('Failed to get WebGL context'); }
}

function connectVariablesToGLSL() {
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('Failed to initialize shaders');
    return;
  }
  a_Position = gl.getAttribLocation(gl.program, 'a_Position');
  u_FragColor = gl.getUniformLocation(gl.program, 'u_FragColor');
  u_ModelMatrix = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
  u_GlobalRotation = gl.getUniformLocation(gl.program, 'u_GlobalRotation');
}

function initCubeBuffer() {
  g_cubeVertBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, g_cubeVertBuf);
  gl.bufferData(gl.ARRAY_BUFFER, _CUBE_VERTS, gl.STATIC_DRAW);

  g_cubeIdxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g_cubeIdxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, _CUBE_IDXS, gl.STATIC_DRAW);
}

function initCylinderBuffer() {
  var segs = 16;
  var verts = [];
  for (var i = 0; i < segs; i++) {
    var t1 = (i / segs) * Math.PI * 2;
    var t2 = ((i + 1) / segs) * Math.PI * 2;
    var x1 = Math.cos(t1) * 0.5, z1 = Math.sin(t1) * 0.5;
    var x2 = Math.cos(t2) * 0.5, z2 = Math.sin(t2) * 0.5;
    verts.push(x1,0,z1, x2,0,z2, x2,1,z2);
    verts.push(x1,0,z1, x2,1,z2, x1,1,z1);
    verts.push(0,1,0, x1,1,z1, x2,1,z2);
    verts.push(0,0,0, x2,0,z2, x1,0,z1);
  }
  g_cylVertBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, g_cylVertBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  g_cylVertCount = verts.length / 3;
}

function drawCube(M, color) {
  gl.uniform4f(u_FragColor, color[0], color[1], color[2], color[3]);
  gl.uniformMatrix4fv(u_ModelMatrix, false, M.elements);

  gl.bindBuffer(gl.ARRAY_BUFFER, g_cubeVertBuf);
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(a_Position);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g_cubeIdxBuf);
  gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_BYTE, 0);
}

function drawCylinder(M, color) {
  gl.uniform4f(u_FragColor, color[0], color[1], color[2], color[3]);
  gl.uniformMatrix4fv(u_ModelMatrix, false, M.elements);

  gl.bindBuffer(gl.ARRAY_BUFFER, g_cylVertBuf);
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(a_Position);

  gl.drawArrays(gl.TRIANGLES, 0, g_cylVertCount);
}

function addActionsForHTMLUI() {
  document.getElementById('angleSlide').addEventListener('input', function() {
    g_globalAngleY = parseFloat(this.value);
    document.getElementById('angleVal').innerText = Math.round(g_globalAngleY);
  });

  document.getElementById('animOn').onclick  = function() { g_animOn = true; };
  document.getElementById('animOff').onclick = function() { g_animOn = false; };

  canvas.onmousedown = function(ev) {
    if (ev.shiftKey) {
      g_isPoked = true;
      g_pokeStart = g_time;
      return;
    }
    g_mouseDown = true;
    g_mouseLastX = ev.clientX;
    g_mouseLastY = ev.clientY;
  };
  canvas.onmouseup = function() { g_mouseDown = false; };
  canvas.onmousemove = function(ev) {
    if (!g_mouseDown) return;
    var dx = ev.clientX - g_mouseLastX;
    var dy = ev.clientY - g_mouseLastY;
    g_globalAngleY = (g_globalAngleY + dx * 0.5) % 360;
    g_globalAngleX = Math.max(-85, Math.min(85, g_globalAngleX + dy * 0.5));
    document.getElementById('angleVal').innerText = Math.round(g_globalAngleY);
    document.getElementById('angleSlide').value = g_globalAngleY;
    g_mouseLastX = ev.clientX;
    g_mouseLastY = ev.clientY;
  };
}

function buildJointSliders() {
  addSlider('Head Turn',    'headY',  -60, 60,   0,  function(v) { g_headAngleY  = v; });
  addSlider('Trunk Upper',  'trunk1', -60, 90,  10,  function(v) { g_trunk1Angle = v; });
  addSlider('Trunk Middle', 'trunk2', -90, 90,  15,  function(v) { g_trunk2Angle = v; });
  addSlider('Trunk Tip',    'trunk3', -90, 90,  20,  function(v) { g_trunk3Angle = v; });
  addSlider('Ear Flap',     'ear',    -50, -5, -25,  function(v) { g_earAngle    = v; });
  addSlider('Tail Base',    'tail1',   2,  90,  55,  function(v) { g_tail1Angle  = v; });
  addSlider('Tail Tip',     'tail2',  -30, 60,  10,  function(v) { g_tail2Angle  = v; });

  var legNames = ['FR', 'FL', 'BR', 'BL'];
  for (let i = 0; i < 4; i++) {
    addSlider(legNames[i] + ' Thigh', 'thigh' + i, -45, 45, 0, function(v) { g_legThigh[i] = v; });
    addSlider(legNames[i] + ' Calf',  'calf'  + i, -10, 60, 0, function(v) { g_legCalf[i]  = v; });
    addSlider(legNames[i] + ' Foot',  'foot'  + i, -15, 15, 0, function(v) { g_legFoot[i]  = v; });
  }
}

function addSlider(label, id, min, max, val, onChange) {
  var container = document.getElementById('jointControls');
  var group = document.createElement('div');
  group.className = 'control-group';

  var lbl = document.createElement('label');
  var span = document.createElement('span');
  span.id = id + 'Val';
  span.innerText = val + '°';
  lbl.appendChild(document.createTextNode(label + ' '));
  lbl.appendChild(span);

  var input = document.createElement('input');
  input.type = 'range';
  input.id = id;
  input.min = min;
  input.max = max;
  input.value = val;
  input.addEventListener('input', function() {
    span.innerText = Math.round(this.value) + '°';
    onChange(parseFloat(this.value));
  });

  group.appendChild(lbl);
  group.appendChild(input);
  container.appendChild(group);
}

function renderScene() {
  var now = performance.now();
  g_fps = Math.round(1000 / (now - g_lastFrameMs));
  g_lastFrameMs = now;
  document.getElementById('perf').innerText = 'FPS: ' + g_fps;

  var gm = new Matrix4();
  gm.setPerspective(45, canvas.width / canvas.height, 0.1, 100);
  gm.lookAt(0, 2.0, 8, 0, 1.5, 0, 0, 1, 0);
  gm.rotate(g_globalAngleY, 0, 1, 0);
  gm.rotate(g_globalAngleX, 1, 0, 0);
  gl.uniformMatrix4fv(u_GlobalRotation, false, gm.elements);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawAnimal();
}

function updatePokeAnimation(elapsed) {
  var phase = elapsed / 2.0;
  var intensity = Math.sin(phase * Math.PI);

  g_trunk1Angle = 10 - 75 * intensity;
  g_trunk2Angle = 15 - 75 * intensity;
  g_trunk3Angle = 20 - 75 * intensity;

  g_earAngle      = -25 - 20 * intensity * Math.abs(Math.sin(elapsed * 12));
  g_tailSwayAngle =  35 * intensity * Math.sin(elapsed * 14);
  g_headAngleY    =  12 * intensity * Math.sin(elapsed * 9);
}

function updateAnimationAngles() {
  var t = g_time;

  var walkSpeed = 1.8;
  var swingDeg = 25;
  var bendDeg = 18;
  var phaseA = Math.sin(t * walkSpeed);
  var phaseB = Math.sin(t * walkSpeed + Math.PI);

  // diagonal pair gait: FR+BL vs FL+BR
  g_legThigh[0] = swingDeg * phaseA;
  g_legThigh[3] = swingDeg * phaseA;
  g_legThigh[1] = swingDeg * phaseB;
  g_legThigh[2] = swingDeg * phaseB;

  g_legCalf[0] = bendDeg * Math.max(0, phaseA);
  g_legCalf[3] = bendDeg * Math.max(0, phaseA);
  g_legCalf[1] = bendDeg * Math.max(0, phaseB);
  g_legCalf[2] = bendDeg * Math.max(0, phaseB);

  // foot cancels thigh+calf so the sole stays parallel to ground; the
  // velocity term tilts toes up while rising and down while falling
  var toeMag = 22;
  var velA = Math.cos(t * walkSpeed);
  var velB = Math.cos(t * walkSpeed + Math.PI);
  var gateA = (1 + Math.tanh(phaseA * 6)) / 2;
  var gateB = (1 + Math.tanh(phaseB * 6)) / 2;
  g_legFoot[0] = -(g_legThigh[0] + g_legCalf[0]) - toeMag * velA * gateA;
  g_legFoot[3] = -(g_legThigh[3] + g_legCalf[3]) - toeMag * velA * gateA;
  g_legFoot[1] = -(g_legThigh[1] + g_legCalf[1]) - toeMag * velB * gateB;
  g_legFoot[2] = -(g_legThigh[2] + g_legCalf[2]) - toeMag * velB * gateB;

  g_trunk1Angle = 10 + 8  * Math.sin(t * 1.5);
  g_trunk2Angle = 15 + 12 * Math.sin(t * 1.5 + 0.6);
  g_trunk3Angle = 20 + 15 * Math.sin(t * 1.5 + 1.2);

  g_earAngle = -25 + 12 * Math.sin(t * 4.0);
  g_tailSwayAngle = 18 * Math.sin(t * 2.5);
  g_headAngleY = 6 * Math.sin(t * walkSpeed * 0.5);
}

function tick() {
  g_time = performance.now() / 1000;

  if (g_animOn) updateAnimationAngles();

  if (g_isPoked) {
    var elapsed = g_time - g_pokeStart;
    if (elapsed > 2.0) {
      g_isPoked = false;
    } else {
      updatePokeAnimation(elapsed);
    }
  }

  renderScene();
  requestAnimationFrame(tick);
}

var BODY  = [0.52, 0.42, 0.34, 1.0];
var HEAD  = [0.62, 0.50, 0.40, 1.0];
var TRUNK = [0.40, 0.32, 0.26, 1.0];
var LEG   = [0.45, 0.36, 0.28, 1.0];
var FOOT  = [0.22, 0.18, 0.15, 1.0];
var EAR   = [0.46, 0.36, 0.30, 1.0];
var TUSK  = [0.94, 0.92, 0.85, 1.0];
var EYE   = [0.05, 0.04, 0.04, 1.0];

// hip world positions: FR, FL, BR, BL
var LEG_HIPS = [
  [ 0.65, 1.05,  0.95],
  [-0.65, 1.05,  0.95],
  [ 0.65, 1.05, -0.95],
  [-0.65, 1.05, -0.95]
];

function drawAnimal() {
  drawBody();
  drawHead();
  drawLeg(0);
  drawLeg(1);
  drawLeg(2);
  drawLeg(3);
  drawTail();
}

function drawBody() {
  var M = new Matrix4();
  M.setTranslate(0, 1.7, 0);
  M.scale(2.0, 1.4, 2.6);
  drawCube(M, BODY);
}

function drawHead() {
  var headFrame = new Matrix4();
  headFrame.translate(0, 2.0, 1.8);
  headFrame.rotate(g_headAngleY, 0, 1, 0);

  var M = new Matrix4(headFrame);
  M.scale(1.4, 1.3, 1.2);
  drawCube(M, HEAD);

  drawTrunk(headFrame);
  drawEar(-1, headFrame);
  drawEar(+1, headFrame);
  drawTusk(-1, headFrame);
  drawTusk(+1, headFrame);
  drawEye(-1, headFrame);
  drawEye(+1, headFrame);
}

// side: -1 = left, +1 = right
function drawEye(side, headFrame) {
  var M = new Matrix4(headFrame);
  M.translate(side * 0.32, 0.18, 0.61);
  M.scale(0.18, 0.18, 0.04);
  drawCube(M, EYE);
}

function drawTusk(side, headFrame) {
  var M = new Matrix4(headFrame);
  M.translate(side * 0.35, -0.5, 0.6);
  M.rotate(side * 12, 0, 1, 0);
  M.rotate(82, 1, 0, 0);
  M.scale(0.07, 0.45, 0.07);
  drawCylinder(M, TUSK);
}

function drawEar(side, headFrame) {
  var earFrame = new Matrix4(headFrame);
  earFrame.translate(side * 0.65, 0.15, 0.45);
  earFrame.rotate(side * g_earAngle, 0, 1, 0);

  var M = new Matrix4(earFrame);
  M.translate(side * 0.04, -0.1, -0.4);
  M.scale(0.08, 0.95, 0.85);
  drawCube(M, EAR);
}

// hangs cube down from parent's origin, returns frame at the bottom for chained children
function drawHangingSegment(parentFrame, angle, w, h, d, color) {
  var seg = new Matrix4(parentFrame);
  seg.rotate(angle, 1, 0, 0);

  var M = new Matrix4(seg);
  M.translate(0, -h / 2, 0);
  M.scale(w, h, d);
  drawCube(M, color);

  seg.translate(0, -h, 0);
  return seg;
}

function drawTrunk(headFrame) {
  var trunkBase = new Matrix4(headFrame);
  trunkBase.translate(0, -0.4, 0.6);

  var f1 = drawHangingSegment(trunkBase, g_trunk1Angle, 0.45, 0.5,  0.45, TRUNK);
  var f2 = drawHangingSegment(f1,        g_trunk2Angle, 0.38, 0.45, 0.38, TRUNK);
  drawHangingSegment(f2, g_trunk3Angle, 0.30, 0.4, 0.30, TRUNK);
}

function drawTail() {
  var tailBase = new Matrix4();
  tailBase.translate(0, 1.85, -1.3);
  tailBase.rotate(g_tailSwayAngle, 0, 0, 1);

  var f1 = drawHangingSegment(tailBase, g_tail1Angle, 0.18, 0.55, 0.18, TRUNK);
  drawHangingSegment(f1, g_tail2Angle, 0.13, 0.40, 0.13, FOOT);
}

function drawLeg(legId) {
  var hip = LEG_HIPS[legId];
  var hipFrame = new Matrix4();
  hipFrame.translate(hip[0], hip[1], hip[2]);

  var knee  = drawHangingSegment(hipFrame, g_legThigh[legId], 0.35, 0.50, 0.35, LEG);
  var ankle = drawHangingSegment(knee,     g_legCalf[legId],  0.30, 0.35, 0.30, LEG);
  drawHangingSegment(ankle, g_legFoot[legId], 0.40, 0.15, 0.45, FOOT);
}
