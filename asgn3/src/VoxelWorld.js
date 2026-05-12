var VSHADER_SOURCE = `
  attribute vec4  a_Position;
  attribute vec2  a_UV;
  attribute float a_Brightness;
  uniform mat4  u_ViewMatrix;
  uniform mat4  u_ProjMatrix;
  uniform float u_UVScale;
  varying vec2  v_UV;
  varying float v_Brightness;
  varying vec3  v_WorldPos;
  void main() {
    gl_Position  = u_ProjMatrix * u_ViewMatrix * a_Position;
    v_UV         = a_UV * u_UVScale;
    v_Brightness = a_Brightness;
    v_WorldPos   = a_Position.xyz;
  }
`;

var FSHADER_SOURCE = `
  precision mediump float;
  uniform sampler2D u_WallSampler;
  uniform sampler2D u_Wall2Sampler;
  uniform sampler2D u_GroundSampler;
  uniform sampler2D u_SkySampler;
  uniform int   u_WhichTexture;
  uniform vec4  u_Color;
  uniform vec3  u_EyePos;
  uniform float u_FogNear;
  uniform float u_FogFar;
  varying vec2  v_UV;
  varying float v_Brightness;
  varying vec3  v_WorldPos;
  void main() {
    vec4 col;
    if      (u_WhichTexture == -2) { col = u_Color; }
    else if (u_WhichTexture ==  0) { col = texture2D(u_WallSampler,   v_UV); }
    else if (u_WhichTexture ==  1) { col = texture2D(u_GroundSampler, v_UV); }
    else if (u_WhichTexture ==  2) { col = texture2D(u_Wall2Sampler,  v_UV); }
    else if (u_WhichTexture ==  3) { col = texture2D(u_SkySampler,    v_UV); }
    else                           { col = vec4(1.0, 0.0, 0.2, 1.0); }
    col.rgb *= v_Brightness;
    if (u_WhichTexture != 3) {
      float dist = length(v_WorldPos - u_EyePos);
      float fog  = clamp((dist - u_FogNear) / (u_FogFar - u_FogNear), 0.0, 1.0);
      col.rgb = mix(col.rgb, vec3(0.53, 0.81, 0.98), fog);
    }
    gl_FragColor = col;
  }
`;

var canvas, gl;
var a_Position, a_UV, a_Brightness;
var u_ViewMatrix, u_ProjMatrix, u_WhichTexture, u_Color, u_UVScale;
var u_WallSampler, u_Wall2Sampler, u_GroundSampler, u_SkySampler;
var u_EyePos, u_FogNear, u_FogFar;

var g_worldVBO_lo, g_worldVertCount_lo;
var g_worldVBO_hi, g_worldVertCount_hi;
var g_groundVBO,   g_groundVertCount;
var g_skyVBO,      g_skyVertCount;
var g_hlVBO,       g_hlVertCount = 0;

var g_texReady = { wall: false, ground: false, wall2: false, sky: false };

function hashNoise(x, z) {
  var n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x, z) {
  var ix = Math.floor(x), iz = Math.floor(z);
  var fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  return hashNoise(ix,   iz)   * (1-fx)*(1-fz) +
         hashNoise(ix+1, iz)   * fx    *(1-fz) +
         hashNoise(ix,   iz+1) * (1-fx)*fz     +
         hashNoise(ix+1, iz+1) * fx    *fz;
}
function groundHeight(x, z) {
  var col = Math.floor(x), row = Math.floor(z);
  // flatten terrain at any vertex touching a wall cell
  function hasWall(r, c) { return c>=0&&c<32&&r>=0&&r<32&&g_map[r][c]>0; }
  if (hasWall(row,col)||hasWall(row-1,col)||hasWall(row,col-1)||hasWall(row-1,col-1)) return 0;
  return smoothNoise((x+37)/10, (z+37)/10) * 0.6
       + smoothNoise((x+37)/5,  (z+37)/5)  * 0.2;
}

// prettier-ignore
var g_map = [
  [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,0,0,0,4],
  [4,0,0,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,3,3,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,3,3,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,4],
  [4,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,4],
  [4,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,3,3,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,3,3,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,4],
  [4,0,0,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,0,0,0,4],
  [4,0,0,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
];

var g_eye   = [16, 3.5, 16];
var g_yaw   = 0;
var g_pitch = 0;

var g_keys = {};
var g_pointerLocked = false;

var g_lastTime = 0, g_fpsTime = 0, g_fpsCount = 0;

function main() {
  canvas = document.getElementById('webgl');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) { alert('WebGL not available'); return; }

  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.error('Shader init failed'); return;
  }

  a_Position      = gl.getAttribLocation(gl.program,  'a_Position');
  a_UV            = gl.getAttribLocation(gl.program,  'a_UV');
  a_Brightness    = gl.getAttribLocation(gl.program,  'a_Brightness');
  u_ViewMatrix    = gl.getUniformLocation(gl.program, 'u_ViewMatrix');
  u_ProjMatrix    = gl.getUniformLocation(gl.program, 'u_ProjMatrix');
  u_WhichTexture  = gl.getUniformLocation(gl.program, 'u_WhichTexture');
  u_Color         = gl.getUniformLocation(gl.program, 'u_Color');
  u_UVScale       = gl.getUniformLocation(gl.program, 'u_UVScale');
  u_WallSampler   = gl.getUniformLocation(gl.program, 'u_WallSampler');
  u_Wall2Sampler  = gl.getUniformLocation(gl.program, 'u_Wall2Sampler');
  u_GroundSampler = gl.getUniformLocation(gl.program, 'u_GroundSampler');
  u_SkySampler    = gl.getUniformLocation(gl.program, 'u_SkySampler');
  u_EyePos        = gl.getUniformLocation(gl.program, 'u_EyePos');
  u_FogNear       = gl.getUniformLocation(gl.program, 'u_FogNear');
  u_FogFar        = gl.getUniformLocation(gl.program, 'u_FogFar');

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.53, 0.81, 0.98, 1.0);

  document.onkeydown = function(ev) { g_keys[ev.code] = true; };
  document.onkeyup   = function(ev) { g_keys[ev.code] = false; };

  canvas.addEventListener('click', function() { canvas.requestPointerLock(); });
  document.addEventListener('pointerlockchange', function() {
    g_pointerLocked = (document.pointerLockElement === canvas);
    document.getElementById('crosshair').style.display = g_pointerLocked ? 'block' : 'none';
  });
  document.addEventListener('mousemove', function(ev) {
    if (!g_pointerLocked) return;
    g_yaw   += ev.movementX * 0.15;
    g_pitch  = Math.max(-80, Math.min(80, g_pitch - ev.movementY * 0.15));
  });
  document.addEventListener('mousedown', function(ev) {
    if (!g_pointerLocked) return;
    if (ev.button === 0) modifyBlock(-1);
    if (ev.button === 2) modifyBlock(+1);
  });
  document.addEventListener('contextmenu', function(ev) { ev.preventDefault(); });

  initTexture('textures/wall.jpg',   gl.TEXTURE0, u_WallSampler,   'wall');
  initTexture('textures/ground.jpg', gl.TEXTURE1, u_GroundSampler, 'ground');
  initTexture('textures/wall2.jpg',  gl.TEXTURE2, u_Wall2Sampler,  'wall2');
  initTexture('textures/sky.jpg',    gl.TEXTURE3, u_SkySampler,    'sky');

  buildWorldGeometry(1, 2, 'lo');
  buildWorldGeometry(3, 4, 'hi');
  buildGroundGeometry();
  buildSkyGeometry();
  g_hlVBO = gl.createBuffer();

  g_lastTime = performance.now();
  tick();
}

function initTexture(src, unit, samplerUniform, key) {
  var img = new Image();
  img.onload = function() {
    gl.activeTexture(unit);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.uniform1i(samplerUniform, unit - gl.TEXTURE0);
    g_texReady[key] = true;
  };
  img.onerror = function() { console.error('Failed to load texture: ' + src); };
  img.src = src;
}

// vertex layout: [x, y, z, u, v, brightness] — 6 floats per vertex
var FSIZE = Float32Array.BYTES_PER_ELEMENT;

function pushFace(arr, x0,y0,z0, x1,y1,z1, x2,y2,z2, x3,y3,z3, b) {
  b = (b !== undefined) ? b : 1.0;
  arr.push(x0,y0,z0, 0,1,b,  x1,y1,z1, 1,1,b,  x2,y2,z2, 1,0,b);
  arr.push(x0,y0,z0, 0,1,b,  x2,y2,z2, 1,0,b,  x3,y3,z3, 0,0,b);
}

function neighborHeight(row, col) {
  if (row < 0 || row >= 32 || col < 0 || col >= 32) return 0;
  return g_map[row][col];
}

function buildWorldGeometry(minH, maxH, tag) {
  var v = [];
  for (var row = 0; row < 32; row++) {
    for (var col = 0; col < 32; col++) {
      var h = g_map[row][col];
      if (h < minH || h > maxH) continue;
      for (var y = 0; y < h; y++) {
        if (neighborHeight(row+1, col) <= y)
          pushFace(v, col,y+1,row+1, col+1,y+1,row+1, col+1,y,row+1, col,y,row+1, 0.70);
        if (neighborHeight(row-1, col) <= y)
          pushFace(v, col+1,y+1,row, col,y+1,row, col,y,row, col+1,y,row,         0.70);
        if (neighborHeight(row, col+1) <= y)
          pushFace(v, col+1,y+1,row+1, col+1,y+1,row, col+1,y,row, col+1,y,row+1, 0.55);
        if (neighborHeight(row, col-1) <= y)
          pushFace(v, col,y+1,row, col,y+1,row+1, col,y,row+1, col,y,row,          0.55);
        if (y === h-1)
          pushFace(v, col,y+1,row, col+1,y+1,row, col+1,y+1,row+1, col,y+1,row+1, 1.00);
      }
    }
  }
  var data = new Float32Array(v);
  var vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  if (tag === 'lo') { g_worldVBO_lo = vbo; g_worldVertCount_lo = data.length / 6; }
  else              { g_worldVBO_hi = vbo; g_worldVertCount_hi = data.length / 6; }
}

function buildGroundGeometry() {
  var v = [], tile = 0.5;
  for (var row = 0; row < 32; row++) {
    for (var col = 0; col < 32; col++) {
      var h00 = groundHeight(col,   row);
      var h10 = groundHeight(col+1, row);
      var h11 = groundHeight(col+1, row+1);
      var h01 = groundHeight(col,   row+1);
      var u0 = col*tile, u1 = (col+1)*tile;
      var t0 = row*tile, t1 = (row+1)*tile;
      v.push(col,  h00, row,   u0,t0, 1.0);
      v.push(col+1,h10, row,   u1,t0, 1.0);
      v.push(col+1,h11, row+1, u1,t1, 1.0);
      v.push(col,  h00, row,   u0,t0, 1.0);
      v.push(col+1,h11, row+1, u1,t1, 1.0);
      v.push(col,  h01, row+1, u0,t1, 1.0);
    }
  }
  var data = new Float32Array(v);
  g_groundVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, g_groundVBO);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  g_groundVertCount = data.length / 6;
}

function buildSkyGeometry() {
  var v = [], S = 800, cx = 16, cy = 0, cz = 16;
  var x0=cx-S, x1=cx+S, y0=cy-S, y1=cy+S, z0=cz-S, z1=cz+S;
  // reversed winding so inner faces are visible
  pushFace(v, x1,y1,z0, x0,y1,z0, x0,y0,z0, x1,y0,z0, 1.0);
  pushFace(v, x0,y1,z1, x1,y1,z1, x1,y0,z1, x0,y0,z1, 1.0);
  pushFace(v, x0,y1,z0, x0,y1,z1, x0,y0,z1, x0,y0,z0, 1.0);
  pushFace(v, x1,y1,z1, x1,y1,z0, x1,y0,z0, x1,y0,z1, 1.0);
  pushFace(v, x0,y1,z1, x1,y1,z1, x1,y1,z0, x0,y1,z0, 1.0);
  pushFace(v, x0,y0,z0, x1,y0,z0, x1,y0,z1, x0,y0,z1, 1.0);
  var data = new Float32Array(v);
  g_skyVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, g_skyVBO);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  g_skyVertCount = data.length / 6;
}

function bindVBO(vbo) {
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.vertexAttribPointer(a_Position,   3, gl.FLOAT, false, 6*FSIZE, 0);
  gl.enableVertexAttribArray(a_Position);
  gl.vertexAttribPointer(a_UV,         2, gl.FLOAT, false, 6*FSIZE, 3*FSIZE);
  gl.enableVertexAttribArray(a_UV);
  gl.vertexAttribPointer(a_Brightness, 1, gl.FLOAT, false, 6*FSIZE, 5*FSIZE);
  gl.enableVertexAttribArray(a_Brightness);
}

var g_projMatrix = new Matrix4();

function getViewMatrix() {
  var yr = g_yaw   * Math.PI / 180;
  var pr = g_pitch * Math.PI / 180;
  var vm = new Matrix4();
  vm.setLookAt(
    g_eye[0], g_eye[1], g_eye[2],
    g_eye[0] + Math.sin(yr)*Math.cos(pr),
    g_eye[1] + Math.sin(pr),
    g_eye[2] - Math.cos(yr)*Math.cos(pr),
    0, 1, 0
  );
  return vm;
}

function moveCamera(speed) {
  var yr = g_yaw * Math.PI / 180;
  g_eye[0] += speed * Math.sin(yr);
  g_eye[2] -= speed * Math.cos(yr);
}

function strafeCamera(speed) {
  var yr = g_yaw * Math.PI / 180;
  g_eye[0] += speed *  Math.cos(yr);
  g_eye[2] += speed *  Math.sin(yr);
}

function processInput(dt) {
  var spd = 5 * dt;
  if (g_keys['KeyW']) moveCamera( spd);
  if (g_keys['KeyS']) moveCamera(-spd);
  if (g_keys['KeyA']) strafeCamera(-spd);
  if (g_keys['KeyD']) strafeCamera( spd);
  if (g_keys['KeyQ']) g_yaw -= 60 * dt;
  if (g_keys['KeyE']) g_yaw += 60 * dt;
}

function getTargetCell() {
  var yr = g_yaw * Math.PI/180, pr = g_pitch * Math.PI/180;
  var fx = Math.sin(yr)*Math.cos(pr), fy = Math.sin(pr), fz = -Math.cos(yr)*Math.cos(pr);
  for (var i = 1; i <= 100; i++) {
    var t = (i/100) * 6;
    var col = Math.floor(g_eye[0] + fx*t);
    var row = Math.floor(g_eye[2] + fz*t);
    var ly  = g_eye[1] + fy*t;
    if (col<0||col>=32||row<0||row>=32) continue;
    if (g_map[row][col] > 0 && ly >= -0.5 && ly < g_map[row][col] + 0.5)
      return { row: row, col: col };
  }
  return null;
}

function modifyBlock(delta) {
  var yr = g_yaw * Math.PI/180, pr = g_pitch * Math.PI/180;
  var fx = Math.sin(yr)*Math.cos(pr), fy = Math.sin(pr), fz = -Math.cos(yr)*Math.cos(pr);
  if (delta === -1) {
    var t = getTargetCell();
    if (!t) return;
    g_map[t.row][t.col] = Math.max(0, g_map[t.row][t.col] - 1);
  } else {
    var lastCol = Math.floor(g_eye[0]);
    var lastRow = Math.floor(g_eye[2]);
    var placed = false;
    for (var i = 1; i <= 200; i++) {
      var tt = (i / 200) * 6;
      var col = Math.floor(g_eye[0] + fx * tt);
      var row = Math.floor(g_eye[2] + fz * tt);
      var ly  = g_eye[1] + fy * tt;
      if (col < 0 || col >= 32 || row < 0 || row >= 32) break;
      if (g_map[row][col] > 0 && ly >= -0.5 && ly < g_map[row][col] + 0.5) {
        if (lastCol >= 0 && lastCol < 32 && lastRow >= 0 && lastRow < 32)
          g_map[lastRow][lastCol] = Math.min(4, Math.max(2, g_map[lastRow][lastCol] + 1));
        placed = true; break;
      }
      lastCol = col; lastRow = row;
    }
    if (!placed) {
      // no wall hit — place 2 units ahead on the horizontal plane
      var fc = Math.floor(g_eye[0] + Math.sin(yr) * 2);
      var fr = Math.floor(g_eye[2] - Math.cos(yr) * 2);
      if (fc >= 0 && fc < 32 && fr >= 0 && fr < 32)
        g_map[fr][fc] = Math.min(4, Math.max(2, g_map[fr][fc] + 1));
    }
  }
  buildWorldGeometry(1, 2, 'lo');
  buildWorldGeometry(3, 4, 'hi');
  buildGroundGeometry();
}

function buildHighlight(target) {
  if (!target) { g_hlVertCount = 0; return; }
  var v = [], col = target.col, row = target.row;
  var h = g_map[row][col];
  var e = 0.02;
  var y = h - 1;
  if (neighborHeight(row+1,col)<=y) pushFace(v, col-e,y+1+e,row+1+e, col+1+e,y+1+e,row+1+e, col+1+e,y-e,row+1+e, col-e,y-e,row+1+e, 1.0);
  if (neighborHeight(row-1,col)<=y) pushFace(v, col+1+e,y+1+e,row-e, col-e,y+1+e,row-e, col-e,y-e,row-e, col+1+e,y-e,row-e, 1.0);
  if (neighborHeight(row,col+1)<=y) pushFace(v, col+1+e,y+1+e,row+1+e, col+1+e,y+1+e,row-e, col+1+e,y-e,row-e, col+1+e,y-e,row+1+e, 1.0);
  if (neighborHeight(row,col-1)<=y) pushFace(v, col-e,y+1+e,row-e, col-e,y+1+e,row+1+e, col-e,y-e,row+1+e, col-e,y-e,row-e, 1.0);
  pushFace(v, col-e,y+1+e,row-e, col+1+e,y+1+e,row-e, col+1+e,y+1+e,row+1+e, col-e,y+1+e,row+1+e, 1.0);
  var data = new Float32Array(v);
  gl.bindBuffer(gl.ARRAY_BUFFER, g_hlVBO);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  g_hlVertCount = data.length / 6;
}

function tick() {
  var now = performance.now();
  var dt  = Math.min((now - g_lastTime) / 1000, 0.05);
  g_lastTime = now;

  g_fpsCount++;
  if (now - g_fpsTime >= 500) {
    document.getElementById('fps').textContent =
      Math.round(g_fpsCount / ((now - g_fpsTime) / 1000));
    g_fpsCount = 0; g_fpsTime = now;
  }

  processInput(dt);
  buildHighlight(getTargetCell());
  renderScene();
  requestAnimationFrame(tick);
}

function renderScene() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  g_projMatrix.setPerspective(60, canvas.width / canvas.height, 0.1, 2000);
  gl.uniformMatrix4fv(u_ProjMatrix, false, g_projMatrix.elements);
  gl.uniformMatrix4fv(u_ViewMatrix, false, getViewMatrix().elements);
  gl.uniform3f(u_EyePos, g_eye[0], g_eye[1], g_eye[2]);
  gl.uniform1f(u_FogNear, 18.0);
  gl.uniform1f(u_FogFar,  38.0);

  gl.depthMask(false);
  gl.uniform1f(u_UVScale, 1.0);
  gl.uniform1i(u_WhichTexture, g_texReady.sky ? 3 : -2);
  gl.uniform4f(u_Color, 0.53, 0.81, 0.98, 1.0);
  bindVBO(g_skyVBO);
  gl.drawArrays(gl.TRIANGLES, 0, g_skyVertCount);
  gl.depthMask(true);

  gl.uniform1f(u_UVScale, 0.3);
  gl.uniform1i(u_WhichTexture, g_texReady.wall2 ? 2 : -2);
  gl.uniform4f(u_Color, 0.75, 0.7, 0.65, 1.0);
  bindVBO(g_worldVBO_lo);
  gl.drawArrays(gl.TRIANGLES, 0, g_worldVertCount_lo);

  gl.uniform1i(u_WhichTexture, g_texReady.wall ? 0 : -2);
  gl.uniform4f(u_Color, 0.5, 0.45, 0.42, 1.0);
  bindVBO(g_worldVBO_hi);
  gl.drawArrays(gl.TRIANGLES, 0, g_worldVertCount_hi);

  gl.uniform1f(u_UVScale, 1.0);
  gl.uniform1i(u_WhichTexture, g_texReady.ground ? 1 : -2);
  gl.uniform4f(u_Color, 0.35, 0.55, 0.25, 1.0);
  bindVBO(g_groundVBO);
  gl.drawArrays(gl.TRIANGLES, 0, g_groundVertCount);

  if (g_hlVertCount > 0) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(u_UVScale, 1.0);
    gl.uniform1i(u_WhichTexture, -2);
    gl.uniform4f(u_Color, 1.0, 1.0, 0.3, 0.25);
    bindVBO(g_hlVBO);
    gl.drawArrays(gl.TRIANGLES, 0, g_hlVertCount);
    gl.disable(gl.BLEND);
  }
}
