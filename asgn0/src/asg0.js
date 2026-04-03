// DrawTriangle.js (c) 2012 matsuda
function main() {
  // Retrieve <canvas> element
  var canvas = document.getElementById("example");
  if (!canvas) {
    console.log("Failed to retrieve the <canvas> element");
    return false;
  }

  // Get the rendering context for 2DCG
  var ctx = canvas.getContext("2d");

  // Draw a blue rectangle
  ctx.fillStyle = "rgba(0, 0, 255, 1.0)"; // Set color to blue
  ctx.fillRect(120, 10, 150, 150); // Fill a rectangle with the color

  // Create a vector
  let v1 = new Vector3([2.25, 2.25, 0]);
  drawVector(v1, "red");
}

function handleDrawEvent() {
  var canvas = document.getElementById("example");
  var ctx = canvas.getContext("2d");

  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Read input values and create v1 and v2
  let x1 = parseFloat(document.getElementById("v1x").value);
  let y1 = parseFloat(document.getElementById("v1y").value);
  let v1 = new Vector3([x1, y1, 0]);

  let x2 = parseFloat(document.getElementById("v2x").value);
  let y2 = parseFloat(document.getElementById("v2y").value);
  let v2 = new Vector3([x2, y2, 0]);

  drawVector(v1, "red");
  drawVector(v2, "blue");
}

function handleDrawOperationEvent() {
  var canvas = document.getElementById("example");
  var ctx = canvas.getContext("2d");

  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Read v1 and v2
  let x1 = parseFloat(document.getElementById("v1x").value);
  let y1 = parseFloat(document.getElementById("v1y").value);
  let v1 = new Vector3([x1, y1, 0]);

  let x2 = parseFloat(document.getElementById("v2x").value);
  let y2 = parseFloat(document.getElementById("v2y").value);
  let v2 = new Vector3([x2, y2, 0]);

  drawVector(v1, "red");
  drawVector(v2, "blue");

  let op = document.getElementById("operation").value;
  let scalar = parseFloat(document.getElementById("scalar").value);

  if (op === "add") {
    let v3 = new Vector3([x1, y1, 0]);
    v3.add(v2);
    drawVector(v3, "green");
  } else if (op === "sub") {
    let v3 = new Vector3([x1, y1, 0]);
    v3.sub(v2);
    drawVector(v3, "green");
  } else if (op === "mul") {
    let v3 = new Vector3([x1, y1, 0]);
    v3.mul(scalar);
    drawVector(v3, "green");
    let v4 = new Vector3([x2, y2, 0]);
    v4.mul(scalar);
    drawVector(v4, "green");
  } else if (op === "div") {
    let v3 = new Vector3([x1, y1, 0]);
    v3.div(scalar);
    drawVector(v3, "green");
    let v4 = new Vector3([x2, y2, 0]);
    v4.div(scalar);
    drawVector(v4, "green");
  } else if (op === "magnitude") {
    console.log("Magnitude of v1: " + v1.magnitude());
    console.log("Magnitude of v2: " + v2.magnitude());
  } else if (op === "normalize") {
    console.log("Magnitude of v1: " + v1.magnitude());
    console.log("Magnitude of v2: " + v2.magnitude());
    let v3 = new Vector3([x1, y1, 0]);
    v3.normalize();
    drawVector(v3, "green");
    let v4 = new Vector3([x2, y2, 0]);
    v4.normalize();
    drawVector(v4, "green");
  } else if (op === "angleBetween") {
    let angle = angleBetween(v1, v2);
    console.log("Angle between v1 and v2: " + angle + " degrees");
  } else if (op === "area") {
    let area = areaTriangle(v1, v2);
    console.log("Area of triangle formed by v1 and v2: " + area);
  }
}

function angleBetween(v1, v2) {
  let dot = Vector3.dot(v1, v2);
  let mag1 = v1.magnitude();
  let mag2 = v2.magnitude();
  let cosAngle = dot / (mag1 * mag2);
  // Clamp to [-1, 1] to avoid NaN from floating point errors
  cosAngle = Math.max(-1, Math.min(1, cosAngle));
  let angleRad = Math.acos(cosAngle);
  return angleRad * (180 / Math.PI);
}

function areaTriangle(v1, v2) {
  let cross = Vector3.cross(v1, v2);
  return cross.magnitude() / 2;
}

function drawVector(v, color) {
  var canvas = document.getElementById("example");
  var ctx = canvas.getContext("2d");
  let scale = 20;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(200, 200);
  ctx.lineTo(200 + v.elements[0] * scale, 200 - v.elements[1] * scale);
  ctx.stroke();
}
