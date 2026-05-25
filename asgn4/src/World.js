// ── Vertex Shader ────────────────────────────────────────────────────────────
var VSHADER_SOURCE = `
  attribute vec4  a_Position;
  attribute vec2  a_UV;
  attribute vec3  a_Normal;

  uniform mat4  u_ModelMatrix;
  uniform mat4  u_ViewMatrix;
  uniform mat4  u_ProjMatrix;
  uniform mat4  u_NormalMatrix;
  uniform float u_UVScale;

  varying vec2  v_UV;
  varying vec3  v_Normal;
  varying vec3  v_WorldPos;

  void main() {
    vec4 wp    = u_ModelMatrix * a_Position;
    gl_Position = u_ProjMatrix * u_ViewMatrix * wp;
    v_UV        = a_UV * u_UVScale;
    v_Normal    = normalize(vec3(u_NormalMatrix * vec4(a_Normal, 0.0)));
    v_WorldPos  = wp.xyz;
  }
`;

// ── Fragment Shader ───────────────────────────────────────────────────────────
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

  // lighting toggles
  uniform int   u_LightingOn;
  uniform int   u_PointOn;
  uniform int   u_SpotOn;
  uniform int   u_ShowNormals;

  // point light
  uniform vec3  u_LightPos;
  uniform vec3  u_LightColor;

  // spot light
  uniform vec3  u_SpotPos;
  uniform vec3  u_SpotDir;
  uniform float u_SpotCutoff;

  varying vec2  v_UV;
  varying vec3  v_Normal;
  varying vec3  v_WorldPos;

  vec3 phong(vec3 lPos, vec3 lColor, vec3 N, vec3 V) {
    vec3 L = normalize(lPos - v_WorldPos);
    vec3 R = reflect(-L, N);
    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(R, V), 0.0), 64.0);
    return lColor * (diff + 0.5 * spec);
  }

  void main() {
    // base color from texture or flat color
    vec4 base;
    if      (u_WhichTexture == -2) { base = u_Color; }
    else if (u_WhichTexture ==  0) { base = texture2D(u_WallSampler,   v_UV); }
    else if (u_WhichTexture ==  1) { base = texture2D(u_GroundSampler, v_UV); }
    else if (u_WhichTexture ==  2) { base = texture2D(u_Wall2Sampler,  v_UV); }
    else if (u_WhichTexture ==  3) { base = texture2D(u_SkySampler,    v_UV); }
    else                           { base = vec4(1.0, 0.0, 0.5, 1.0); }

    // normal visualization mode
    if (u_ShowNormals == 1) {
      gl_FragColor = vec4(normalize(v_Normal) * 0.5 + 0.5, 1.0);
      return;
    }

    // sky: no lighting, no fog
    if (u_WhichTexture == 3) {
      gl_FragColor = base;
      return;
    }

    vec4 col;
    if (u_LightingOn == 1) {
      vec3 N = normalize(v_Normal);
      vec3 V = normalize(u_EyePos - v_WorldPos);
      vec3 lit = vec3(0.2); // ambient

      if (u_PointOn == 1) lit += phong(u_LightPos, u_LightColor, N, V);

      if (u_SpotOn == 1) {
        vec3 spotL = normalize(u_SpotPos - v_WorldPos);
        float cosA = dot(-spotL, normalize(u_SpotDir));
        if (cosA > u_SpotCutoff) {
          float t = (cosA - u_SpotCutoff) / (1.0 - u_SpotCutoff);
          lit += t * phong(u_SpotPos, vec3(1.0, 0.95, 0.7), N, V);
        }
      }

      col = vec4(base.rgb * clamp(lit, 0.0, 1.5), base.a);
    } else {
      col = base;
    }

    // fog
    float dist = length(v_WorldPos - u_EyePos);
    float fog  = clamp((dist - u_FogNear) / (u_FogFar - u_FogNear), 0.0, 1.0);
    col.rgb = mix(col.rgb, vec3(0.53, 0.81, 0.98), fog);

    gl_FragColor = col;
  }
`;

// ── Globals ───────────────────────────────────────────────────────────────────
var canvas, gl;

// attribute / uniform locations
var a_Position, a_UV, a_Normal;
var u_ModelMatrix, u_ViewMatrix, u_ProjMatrix, u_NormalMatrix, u_UVScale;
var u_WhichTexture, u_Color;
var u_EyePos, u_FogNear, u_FogFar;
var u_LightingOn, u_PointOn, u_SpotOn, u_ShowNormals;
var u_LightPos, u_LightColor;
var u_SpotPos, u_SpotDir, u_SpotCutoff;
var u_WallSampler, u_Wall2Sampler, u_GroundSampler, u_SkySampler;

// VBOs
var g_worldVBO_lo, g_worldVertCount_lo;
var g_worldVBO_hi, g_worldVertCount_hi;
var g_groundVBO,   g_groundVertCount;
var g_skyVBO,      g_skyVertCount;
var g_hlVBO,       g_hlVertCount = 0;
var g_cubeVBO,     g_cubeVertCount;
var g_sphereVBO,   g_sphereVertCount;
var g_objVBO,      g_objVertCount = 0;

var g_texReady = { wall: false, ground: false, wall2: false, sky: false };

// camera
var g_eye   = [16, 3.5, 16];
var g_yaw   = 0;
var g_pitch = 0;
var g_keys  = {};
var g_pointerLocked = false;

// lighting state
var g_lightingOn  = true;
var g_pointLightOn = true;
var g_spotOn      = false;
var g_showNormals = false;
var g_autoOrbit   = true;

// point light
var g_lightAngle = 0;
var g_lightPos   = [26, 6, 16];
var g_lightColor = [1.0, 1.0, 1.0];

// spot light
var g_spotPos     = [16, 12, 10];
var g_spotDir     = [0, -1, 0];
var g_spotCutoff  = Math.cos(30 * Math.PI / 180);

// timing / FPS
var g_lastTime = 0, g_fpsTime = 0, g_fpsCount = 0;

var g_projMatrix = new Matrix4();
var g_idMatrix   = new Matrix4(); // stays identity

// ── Map ───────────────────────────────────────────────────────────────────────
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

// ── Entry point ───────────────────────────────────────────────────────────────
function main() {
  canvas = document.getElementById('webgl');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) { alert('WebGL not available'); return; }

  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.error('Shader compile failed'); return;
  }

  // attributes
  a_Position = gl.getAttribLocation(gl.program, 'a_Position');
  a_UV       = gl.getAttribLocation(gl.program, 'a_UV');
  a_Normal   = gl.getAttribLocation(gl.program, 'a_Normal');

  // uniforms
  u_ModelMatrix  = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
  u_ViewMatrix   = gl.getUniformLocation(gl.program, 'u_ViewMatrix');
  u_ProjMatrix   = gl.getUniformLocation(gl.program, 'u_ProjMatrix');
  u_NormalMatrix = gl.getUniformLocation(gl.program, 'u_NormalMatrix');
  u_UVScale      = gl.getUniformLocation(gl.program, 'u_UVScale');
  u_WhichTexture = gl.getUniformLocation(gl.program, 'u_WhichTexture');
  u_Color        = gl.getUniformLocation(gl.program, 'u_Color');
  u_EyePos       = gl.getUniformLocation(gl.program, 'u_EyePos');
  u_FogNear      = gl.getUniformLocation(gl.program, 'u_FogNear');
  u_FogFar       = gl.getUniformLocation(gl.program, 'u_FogFar');
  u_LightingOn   = gl.getUniformLocation(gl.program, 'u_LightingOn');
  u_PointOn      = gl.getUniformLocation(gl.program, 'u_PointOn');
  u_SpotOn       = gl.getUniformLocation(gl.program, 'u_SpotOn');
  u_ShowNormals  = gl.getUniformLocation(gl.program, 'u_ShowNormals');
  u_LightPos     = gl.getUniformLocation(gl.program, 'u_LightPos');
  u_LightColor   = gl.getUniformLocation(gl.program, 'u_LightColor');
  u_SpotPos      = gl.getUniformLocation(gl.program, 'u_SpotPos');
  u_SpotDir      = gl.getUniformLocation(gl.program, 'u_SpotDir');
  u_SpotCutoff   = gl.getUniformLocation(gl.program, 'u_SpotCutoff');
  u_WallSampler   = gl.getUniformLocation(gl.program, 'u_WallSampler');
  u_Wall2Sampler  = gl.getUniformLocation(gl.program, 'u_Wall2Sampler');
  u_GroundSampler = gl.getUniformLocation(gl.program, 'u_GroundSampler');
  u_SkySampler    = gl.getUniformLocation(gl.program, 'u_SkySampler');

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.53, 0.81, 0.98, 1.0);

  // input
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

  // textures
  initTexture('textures/wall.jpg',   gl.TEXTURE0, u_WallSampler,   'wall');
  initTexture('textures/ground.jpg', gl.TEXTURE1, u_GroundSampler, 'ground');
  initTexture('textures/wall2.jpg',  gl.TEXTURE2, u_Wall2Sampler,  'wall2');
  initTexture('textures/sky.jpg',    gl.TEXTURE3, u_SkySampler,    'sky');

  // geometry
  buildWorldGeometry(1, 2, 'lo');
  buildWorldGeometry(3, 4, 'hi');
  buildGroundGeometry();
  buildSkyGeometry();
  buildCubeGeometry();
  buildSphereGeometry(24);
  g_hlVBO = gl.createBuffer();

  loadOBJ('models/pyramid.obj');

  g_lastTime = performance.now();
  tick();
}

// ── Texture ───────────────────────────────────────────────────────────────────
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
  img.src = src;
}

// ── Vertex format: [x,y,z, u,v, nx,ny,nz] = 8 floats ─────────────────────────
var FSIZE = Float32Array.BYTES_PER_ELEMENT;

function pushFace(arr, x0,y0,z0, x1,y1,z1, x2,y2,z2, x3,y3,z3, nx,ny,nz) {
  arr.push(x0,y0,z0, 0,1, nx,ny,nz);
  arr.push(x1,y1,z1, 1,1, nx,ny,nz);
  arr.push(x2,y2,z2, 1,0, nx,ny,nz);
  arr.push(x0,y0,z0, 0,1, nx,ny,nz);
  arr.push(x2,y2,z2, 1,0, nx,ny,nz);
  arr.push(x3,y3,z3, 0,0, nx,ny,nz);
}

function uploadVBO(data) {
  var vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return vbo;
}

// ── World geometry ────────────────────────────────────────────────────────────
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
          pushFace(v, col,y+1,row+1, col+1,y+1,row+1, col+1,y,row+1, col,y,row+1,  0,0,1);
        if (neighborHeight(row-1, col) <= y)
          pushFace(v, col+1,y+1,row, col,y+1,row, col,y,row, col+1,y,row,          0,0,-1);
        if (neighborHeight(row, col+1) <= y)
          pushFace(v, col+1,y+1,row+1, col+1,y+1,row, col+1,y,row, col+1,y,row+1, 1,0,0);
        if (neighborHeight(row, col-1) <= y)
          pushFace(v, col,y+1,row, col,y+1,row+1, col,y,row+1, col,y,row,          -1,0,0);
        if (y === h-1)
          pushFace(v, col,y+1,row, col+1,y+1,row, col+1,y+1,row+1, col,y+1,row+1, 0,1,0);
      }
    }
  }
  var data = new Float32Array(v);
  var vbo = uploadVBO(data);
  if (tag === 'lo') { g_worldVBO_lo = vbo; g_worldVertCount_lo = data.length / 8; }
  else              { g_worldVBO_hi = vbo; g_worldVertCount_hi = data.length / 8; }
}

// ── Terrain helpers ───────────────────────────────────────────────────────────
function hashNoise(x, z) {
  var n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x, z) {
  var ix = Math.floor(x), iz = Math.floor(z);
  var fx = x-ix, fz = z-iz;
  fx = fx*fx*(3-2*fx); fz = fz*fz*(3-2*fz);
  return hashNoise(ix,iz)*(1-fx)*(1-fz) + hashNoise(ix+1,iz)*fx*(1-fz)
       + hashNoise(ix,iz+1)*(1-fx)*fz   + hashNoise(ix+1,iz+1)*fx*fz;
}
function groundHeight(x, z) {
  var col = Math.floor(x), row = Math.floor(z);
  function hasWall(r,c) { return c>=0&&c<32&&r>=0&&r<32&&g_map[r][c]>0; }
  if (hasWall(row,col)||hasWall(row-1,col)||hasWall(row,col-1)||hasWall(row-1,col-1)) return 0;
  return smoothNoise((x+37)/10,(z+37)/10)*0.6 + smoothNoise((x+37)/5,(z+37)/5)*0.2;
}

function buildGroundGeometry() {
  var v = [], tile = 0.5;
  for (var row = 0; row < 32; row++) {
    for (var col = 0; col < 32; col++) {
      var h00 = groundHeight(col,row),   h10 = groundHeight(col+1,row);
      var h11 = groundHeight(col+1,row+1), h01 = groundHeight(col,row+1);
      var u0=col*tile, u1=(col+1)*tile, t0=row*tile, t1=(row+1)*tile;
      // compute face normal from cross product for terrain triangles
      function triNorm(ax,ay,az, bx,by,bz, cx,cy,cz) {
        var ex=bx-ax,ey=by-ay,ez=bz-az, fx=cx-ax,fy=cy-ay,fz=cz-az;
        var nx=ey*fz-ez*fy, ny=ez*fx-ex*fz, nz=ex*fy-ey*fx;
        var l=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
        return [nx/l,ny/l,nz/l];
      }
      var n1=triNorm(col,h00,row, col+1,h10,row, col+1,h11,row+1);
      v.push(col,h00,row,       u0,t0, n1[0],n1[1],n1[2]);
      v.push(col+1,h10,row,     u1,t0, n1[0],n1[1],n1[2]);
      v.push(col+1,h11,row+1,   u1,t1, n1[0],n1[1],n1[2]);
      var n2=triNorm(col,h00,row, col+1,h11,row+1, col,h01,row+1);
      v.push(col,h00,row,       u0,t0, n2[0],n2[1],n2[2]);
      v.push(col+1,h11,row+1,   u1,t1, n2[0],n2[1],n2[2]);
      v.push(col,h01,row+1,     u0,t1, n2[0],n2[1],n2[2]);
    }
  }
  var data = new Float32Array(v);
  g_groundVBO = uploadVBO(data);
  g_groundVertCount = data.length / 8;
}

function buildSkyGeometry() {
  var v = [], S=800, cx=16, cy=0, cz=16;
  var x0=cx-S,x1=cx+S, y0=cy-S,y1=cy+S, z0=cz-S,z1=cz+S;
  // reversed winding so inner faces visible; normals point inward (don't matter – no lighting on sky)
  pushFace(v, x1,y1,z0, x0,y1,z0, x0,y0,z0, x1,y0,z0, 0,0,1);
  pushFace(v, x0,y1,z1, x1,y1,z1, x1,y0,z1, x0,y0,z1, 0,0,-1);
  pushFace(v, x0,y1,z0, x0,y1,z1, x0,y0,z1, x0,y0,z0, 1,0,0);
  pushFace(v, x1,y1,z1, x1,y1,z0, x1,y0,z0, x1,y0,z1, -1,0,0);
  pushFace(v, x0,y1,z1, x1,y1,z1, x1,y1,z0, x0,y1,z0, 0,-1,0);
  pushFace(v, x0,y0,z0, x1,y0,z0, x1,y0,z1, x0,y0,z1, 0,1,0);
  var data = new Float32Array(v);
  g_skyVBO = uploadVBO(data);
  g_skyVertCount = data.length / 8;
}

// ── Cube (unit, centered at origin) ──────────────────────────────────────────
function buildCubeGeometry() {
  var v = [];
  var faces = [
    [ 0, 0,-1, [-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[0.5,0.5,-0.5],[-0.5,0.5,-0.5]],
    [ 0, 0, 1, [ 0.5,-0.5, 0.5],[-0.5,-0.5,0.5],[-0.5,0.5,0.5],[0.5,0.5,0.5]],
    [-1, 0, 0, [-0.5,-0.5, 0.5],[-0.5,-0.5,-0.5],[-0.5,0.5,-0.5],[-0.5,0.5,0.5]],
    [ 1, 0, 0, [ 0.5,-0.5,-0.5],[0.5,-0.5,0.5],[0.5,0.5,0.5],[0.5,0.5,-0.5]],
    [ 0,-1, 0, [-0.5,-0.5, 0.5],[0.5,-0.5,0.5],[0.5,-0.5,-0.5],[-0.5,-0.5,-0.5]],
    [ 0, 1, 0, [-0.5, 0.5,-0.5],[0.5,0.5,-0.5],[0.5,0.5,0.5],[-0.5,0.5,0.5]],
  ];
  faces.forEach(function(f) {
    var nx=f[0],ny=f[1],nz=f[2], a=f[3],b=f[4],c=f[5],d=f[6];
    v.push(a[0],a[1],a[2], 0,1, nx,ny,nz);
    v.push(b[0],b[1],b[2], 1,1, nx,ny,nz);
    v.push(c[0],c[1],c[2], 1,0, nx,ny,nz);
    v.push(a[0],a[1],a[2], 0,1, nx,ny,nz);
    v.push(c[0],c[1],c[2], 1,0, nx,ny,nz);
    v.push(d[0],d[1],d[2], 0,0, nx,ny,nz);
  });
  var data = new Float32Array(v);
  g_cubeVBO = uploadVBO(data);
  g_cubeVertCount = data.length / 8;
}

// ── Sphere (unit radius, centered at origin) ──────────────────────────────────
function buildSphereGeometry(div) {
  var v = [];
  for (var lat = 0; lat < div; lat++) {
    var t0 = (lat / div) * Math.PI;
    var t1 = ((lat+1) / div) * Math.PI;
    for (var lon = 0; lon < div; lon++) {
      var p0 = (lon / div) * 2*Math.PI;
      var p1 = ((lon+1) / div) * 2*Math.PI;
      // 4 corners of the spherical quad; for unit sphere: normal == position
      var pts = [[t0,p0],[t0,p1],[t1,p1],[t1,p0]].map(function(tp) {
        var t=tp[0],p=tp[1];
        var x=Math.sin(t)*Math.cos(p), y=Math.cos(t), z=Math.sin(t)*Math.sin(p);
        var u=p/(2*Math.PI), vt=t/Math.PI;
        return [x,y,z, u,vt, x,y,z]; // normal == position for unit sphere
      });
      var a=pts[0],b=pts[1],c=pts[2],d=pts[3];
      v.push.apply(v,a); v.push.apply(v,b); v.push.apply(v,c);
      v.push.apply(v,a); v.push.apply(v,c); v.push.apply(v,d);
    }
  }
  var data = new Float32Array(v);
  g_sphereVBO = uploadVBO(data);
  g_sphereVertCount = data.length / 8;
}

// ── OBJ loader ────────────────────────────────────────────────────────────────
function loadOBJ(src) {
  fetch(src).then(function(r) { return r.text(); }).then(function(text) {
    var verts = [], v = [];
    text.split('\n').forEach(function(line) {
      var p = line.trim().split(/\s+/);
      if (p[0] === 'v') {
        verts.push([parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])]);
      } else if (p[0] === 'f') {
        var idx = p.slice(1).map(function(s) { return parseInt(s.split('/')[0]) - 1; });
        for (var i = 1; i < idx.length-1; i++) {
          var i0=idx[0], i1=idx[i], i2=idx[i+1];
          var p0=verts[i0], p1=verts[i1], p2=verts[i2];
          var ex=p1[0]-p0[0],ey=p1[1]-p0[1],ez=p1[2]-p0[2];
          var fx=p2[0]-p0[0],fy=p2[1]-p0[1],fz=p2[2]-p0[2];
          var nx=ey*fz-ez*fy, ny=ez*fx-ex*fz, nz=ex*fy-ey*fx;
          var l=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
          nx/=l; ny/=l; nz/=l;
          [p0,p1,p2].forEach(function(pt) {
            v.push(pt[0],pt[1],pt[2], 0,0, nx,ny,nz);
          });
        }
      }
    });
    var data = new Float32Array(v);
    g_objVBO = uploadVBO(data);
    g_objVertCount = data.length / 8;
  }).catch(function(e) { console.warn('OBJ load failed:', e); });
}

// ── VBO bind (8-float stride) ─────────────────────────────────────────────────
function bindVBO(vbo) {
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 8*FSIZE, 0);
  gl.enableVertexAttribArray(a_Position);
  gl.vertexAttribPointer(a_UV,       2, gl.FLOAT, false, 8*FSIZE, 3*FSIZE);
  gl.enableVertexAttribArray(a_UV);
  gl.vertexAttribPointer(a_Normal,   3, gl.FLOAT, false, 8*FSIZE, 5*FSIZE);
  gl.enableVertexAttribArray(a_Normal);
}

// ── Camera ────────────────────────────────────────────────────────────────────
function getViewMatrix() {
  var yr=g_yaw*Math.PI/180, pr=g_pitch*Math.PI/180;
  var vm=new Matrix4();
  vm.setLookAt(
    g_eye[0], g_eye[1], g_eye[2],
    g_eye[0]+Math.sin(yr)*Math.cos(pr),
    g_eye[1]+Math.sin(pr),
    g_eye[2]-Math.cos(yr)*Math.cos(pr),
    0,1,0
  );
  return vm;
}
function moveCamera(spd) {
  var yr=g_yaw*Math.PI/180;
  g_eye[0]+=spd*Math.sin(yr); g_eye[2]-=spd*Math.cos(yr);
}
function strafeCamera(spd) {
  var yr=g_yaw*Math.PI/180;
  g_eye[0]+=spd*Math.cos(yr); g_eye[2]+=spd*Math.sin(yr);
}
function processInput(dt) {
  var spd=5*dt;
  if(g_keys['KeyW']) moveCamera( spd);
  if(g_keys['KeyS']) moveCamera(-spd);
  if(g_keys['KeyA']) strafeCamera(-spd);
  if(g_keys['KeyD']) strafeCamera( spd);
  if(g_keys['KeyQ']) g_yaw-=60*dt;
  if(g_keys['KeyE']) g_yaw+=60*dt;
}

// ── Block picking / editing ───────────────────────────────────────────────────
function getTargetCell() {
  var yr=g_yaw*Math.PI/180, pr=g_pitch*Math.PI/180;
  var fx=Math.sin(yr)*Math.cos(pr), fy=Math.sin(pr), fz=-Math.cos(yr)*Math.cos(pr);
  for (var i=1; i<=100; i++) {
    var t=(i/100)*6;
    var col=Math.floor(g_eye[0]+fx*t), row=Math.floor(g_eye[2]+fz*t), ly=g_eye[1]+fy*t;
    if(col<0||col>=32||row<0||row>=32) continue;
    if(g_map[row][col]>0 && ly>=-0.5 && ly<g_map[row][col]+0.5) return {row,col};
  }
  return null;
}
function modifyBlock(delta) {
  var yr=g_yaw*Math.PI/180, pr=g_pitch*Math.PI/180;
  var fx=Math.sin(yr)*Math.cos(pr), fy=Math.sin(pr), fz=-Math.cos(yr)*Math.cos(pr);
  if (delta===-1) {
    var t=getTargetCell(); if(!t) return;
    g_map[t.row][t.col]=Math.max(0,g_map[t.row][t.col]-1);
  } else {
    var lastCol=Math.floor(g_eye[0]), lastRow=Math.floor(g_eye[2]), placed=false;
    for (var i=1; i<=200; i++) {
      var tt=(i/200)*6, col=Math.floor(g_eye[0]+fx*tt), row=Math.floor(g_eye[2]+fz*tt), ly=g_eye[1]+fy*tt;
      if(col<0||col>=32||row<0||row>=32) break;
      if(g_map[row][col]>0 && ly>=-0.5 && ly<g_map[row][col]+0.5) {
        if(lastCol>=0&&lastCol<32&&lastRow>=0&&lastRow<32)
          g_map[lastRow][lastCol]=Math.min(4,Math.max(2,g_map[lastRow][lastCol]+1));
        placed=true; break;
      }
      lastCol=col; lastRow=row;
    }
    if(!placed) {
      var fc=Math.floor(g_eye[0]+Math.sin(yr)*2), fr=Math.floor(g_eye[2]-Math.cos(yr)*2);
      if(fc>=0&&fc<32&&fr>=0&&fr<32) g_map[fr][fc]=Math.min(4,Math.max(2,g_map[fr][fc]+1));
    }
  }
  buildWorldGeometry(1,2,'lo'); buildWorldGeometry(3,4,'hi'); buildGroundGeometry();
}

// ── Block highlight ───────────────────────────────────────────────────────────
function buildHighlight(target) {
  if (!target) { g_hlVertCount=0; return; }
  var v=[], col=target.col, row=target.row, h=g_map[row][col], e=0.02, y=h-1;
  function pf(x0,y0,z0,x1,y1,z1,x2,y2,z2,x3,y3,z3) {
    v.push(x0,y0,z0,0,1,0,1,0, x1,y1,z1,1,1,0,1,0, x2,y2,z2,1,0,0,1,0);
    v.push(x0,y0,z0,0,1,0,1,0, x2,y2,z2,1,0,0,1,0, x3,y3,z3,0,0,0,1,0);
  }
  if(neighborHeight(row+1,col)<=y) pf(col-e,y+1+e,row+1+e, col+1+e,y+1+e,row+1+e, col+1+e,y-e,row+1+e, col-e,y-e,row+1+e);
  if(neighborHeight(row-1,col)<=y) pf(col+1+e,y+1+e,row-e, col-e,y+1+e,row-e, col-e,y-e,row-e, col+1+e,y-e,row-e);
  if(neighborHeight(row,col+1)<=y) pf(col+1+e,y+1+e,row+1+e, col+1+e,y+1+e,row-e, col+1+e,y-e,row-e, col+1+e,y-e,row+1+e);
  if(neighborHeight(row,col-1)<=y) pf(col-e,y+1+e,row-e, col-e,y+1+e,row+1+e, col-e,y-e,row+1+e, col-e,y-e,row-e);
  pf(col-e,y+1+e,row-e, col+1+e,y+1+e,row-e, col+1+e,y+1+e,row+1+e, col-e,y+1+e,row+1+e);
  var data=new Float32Array(v);
  gl.bindBuffer(gl.ARRAY_BUFFER, g_hlVBO);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  g_hlVertCount=data.length/8;
}

// ── UI callbacks ──────────────────────────────────────────────────────────────
function toggleLighting()  {
  g_lightingOn=!g_lightingOn;
  document.getElementById('btnLighting').textContent='Lighting: '+(g_lightingOn?'ON':'OFF');
}
function toggleNormals()   {
  g_showNormals=!g_showNormals;
  document.getElementById('btnNormals').textContent='Show Normals: '+(g_showNormals?'ON':'OFF');
}
function togglePointLight(){
  g_pointLightOn=!g_pointLightOn;
  document.getElementById('btnPoint').textContent='Point Light: '+(g_pointLightOn?'ON':'OFF');
}
function toggleSpot()      {
  g_spotOn=!g_spotOn;
  document.getElementById('btnSpot').textContent='Spot Light: '+(g_spotOn?'ON':'OFF');
}
function toggleOrbit()     {
  g_autoOrbit=!g_autoOrbit;
  document.getElementById('btnOrbit').textContent='Auto Orbit: '+(g_autoOrbit?'ON':'OFF');
}
function updateLightColor() {
  g_lightColor[0]=document.getElementById('sldR').value/255;
  g_lightColor[1]=document.getElementById('sldG').value/255;
  g_lightColor[2]=document.getElementById('sldB').value/255;
}

// ── Tick ──────────────────────────────────────────────────────────────────────
function tick() {
  var now=performance.now();
  var dt=Math.min((now-g_lastTime)/1000, 0.05);
  g_lastTime=now;

  // FPS counter
  g_fpsCount++;
  if (now-g_fpsTime>=500) {
    document.getElementById('fps').textContent=Math.round(g_fpsCount/((now-g_fpsTime)/1000));
    g_fpsCount=0; g_fpsTime=now;
  }

  // orbit light
  if (g_autoOrbit) {
    g_lightAngle+=dt*0.6;
    document.getElementById('sldAngle').value=((g_lightAngle*180/Math.PI)%360+360)%360;
  }
  g_lightPos[0]=16+10*Math.cos(g_lightAngle);
  g_lightPos[2]=16+10*Math.sin(g_lightAngle);

  processInput(dt);
  buildHighlight(getTargetCell());
  renderScene();
  requestAnimationFrame(tick);
}

// ── Render helpers ────────────────────────────────────────────────────────────
var g_normalMatrix = new Matrix4();

function setModel(mat) {
  gl.uniformMatrix4fv(u_ModelMatrix, false, mat.elements);
  g_normalMatrix.setInverseOf(mat);
  g_normalMatrix.transpose();
  gl.uniformMatrix4fv(u_NormalMatrix, false, g_normalMatrix.elements);
}

function drawObject(vbo, count, texId, color, modelMat) {
  setModel(modelMat);
  gl.uniform1i(u_WhichTexture, texId);
  if (color) gl.uniform4fv(u_Color, color);
  bindVBO(vbo);
  gl.drawArrays(gl.TRIANGLES, 0, count);
}

// draw a marker cube at world position (no Phong – always full-bright)
function drawMarker(pos, scale, color) {
  var m=new Matrix4();
  m.setTranslate(pos[0],pos[1],pos[2]);
  m.scale(scale,scale,scale);
  gl.uniform1i(u_LightingOn, 0);
  drawObject(g_cubeVBO, g_cubeVertCount, -2, color, m);
  gl.uniform1i(u_LightingOn, g_lightingOn?1:0);
}

// ── renderScene ───────────────────────────────────────────────────────────────
function renderScene() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  g_projMatrix.setPerspective(60, canvas.width/canvas.height, 0.1, 2000);
  gl.uniformMatrix4fv(u_ProjMatrix,  false, g_projMatrix.elements);
  gl.uniformMatrix4fv(u_ViewMatrix,  false, getViewMatrix().elements);
  gl.uniform3fv(u_EyePos, g_eye);
  gl.uniform1f(u_FogNear, 20.0);
  gl.uniform1f(u_FogFar,  40.0);

  // lighting uniforms
  gl.uniform1i(u_LightingOn,  g_lightingOn  ? 1 : 0);
  gl.uniform1i(u_PointOn,     g_pointLightOn? 1 : 0);
  gl.uniform1i(u_SpotOn,      g_spotOn      ? 1 : 0);
  gl.uniform1i(u_ShowNormals, g_showNormals ? 1 : 0);
  gl.uniform3fv(u_LightPos,   g_lightPos);
  gl.uniform3fv(u_LightColor, g_lightColor);
  gl.uniform3fv(u_SpotPos,    g_spotPos);
  gl.uniform3fv(u_SpotDir,    g_spotDir);
  gl.uniform1f(u_SpotCutoff,  g_spotCutoff);

  // ── sky (depth write off, no lighting, no fog – handled in shader) ──
  gl.depthMask(false);
  gl.uniform1i(u_LightingOn, 0);
  gl.uniform1i(u_ShowNormals, 0);
  gl.uniform1f(u_UVScale, 1.0);
  gl.uniform1i(u_WhichTexture, g_texReady.sky ? 3 : -2);
  gl.uniform4f(u_Color, 0.53,0.81,0.98,1.0);
  setModel(g_idMatrix);
  bindVBO(g_skyVBO);
  gl.drawArrays(gl.TRIANGLES, 0, g_skyVertCount);
  gl.depthMask(true);
  // restore lighting state
  gl.uniform1i(u_LightingOn,  g_lightingOn  ? 1 : 0);
  gl.uniform1i(u_ShowNormals, g_showNormals ? 1 : 0);

  // ── world walls lo (tex wall2, heights 1-2) ──
  gl.uniform1f(u_UVScale, 0.3);
  drawObject(g_worldVBO_lo, g_worldVertCount_lo,
    g_texReady.wall2?2:-2, [0.75,0.7,0.65,1.0], g_idMatrix);

  // ── world walls hi (tex wall, heights 3-4) ──
  drawObject(g_worldVBO_hi, g_worldVertCount_hi,
    g_texReady.wall?0:-2,  [0.5,0.45,0.42,1.0], g_idMatrix);

  // ── ground ──
  gl.uniform1f(u_UVScale, 1.0);
  drawObject(g_groundVBO, g_groundVertCount,
    g_texReady.ground?1:-2, [0.35,0.55,0.25,1.0], g_idMatrix);

  // ── display cube at (5, 0.5, 5) ──
  var cm=new Matrix4(); cm.setTranslate(5,0.5,5);
  drawObject(g_cubeVBO, g_cubeVertCount, -2, [0.9,0.7,0.2,1.0], cm);

  // ── sphere 1 – inside the inner room ──
  var sm=new Matrix4(); sm.setTranslate(15.5,2,16); sm.scale(1.2,1.2,1.2);
  drawObject(g_sphereVBO, g_sphereVertCount, -2, [0.85,0.2,0.2,1.0], sm);

  // ── sphere 2 – open area ──
  var sm2=new Matrix4(); sm2.setTranslate(22,1.5,22); sm2.scale(1.0,1.0,1.0);
  drawObject(g_sphereVBO, g_sphereVertCount, -2, [0.2,0.4,0.9,1.0], sm2);

  // ── OBJ model (pyramid) ──
  if (g_objVertCount > 0) {
    var om=new Matrix4(); om.setTranslate(10,0,10); om.scale(80,80,80);
    drawObject(g_objVBO, g_objVertCount, -2, [0.6,0.3,0.85,1.0], om);
  }

  // ── light marker cube (always full-bright, shows current light color) ──
  drawMarker(g_lightPos, 0.35, [g_lightColor[0],g_lightColor[1],g_lightColor[2],1.0]);

  // ── spotlight marker ──
  if (g_spotOn) {
    drawMarker(g_spotPos, 0.4, [1.0,0.95,0.5,1.0]);
  }

  // ── block highlight ──
  if (g_hlVertCount > 0) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(u_LightingOn, 0);
    gl.uniform1i(u_ShowNormals, 0);
    gl.uniform1f(u_UVScale, 1.0);
    gl.uniform1i(u_WhichTexture, -2);
    gl.uniform4f(u_Color, 1.0,1.0,0.3,0.25);
    setModel(g_idMatrix);
    bindVBO(g_hlVBO);
    gl.drawArrays(gl.TRIANGLES, 0, g_hlVertCount);
    gl.disable(gl.BLEND);
    gl.uniform1i(u_LightingOn,  g_lightingOn  ? 1 : 0);
    gl.uniform1i(u_ShowNormals, g_showNormals ? 1 : 0);
  }
}
