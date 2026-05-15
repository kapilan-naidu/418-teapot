// sketch.js
// p5.js sketch — wired in next session
// Exposes a params object that ws-client.js will write into

const params = {
  // Audience controls will populate these
  // e.g. speed: 1, density: 0.5, hue: 180
};

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("sketch-container");
}

function draw() {
  background(0);
  // Sketch logic goes here
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
