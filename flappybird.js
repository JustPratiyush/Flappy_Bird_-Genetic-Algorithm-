//board
let board;
let boardWidth = 360;
let boardHeight = 640;
let context;

//bird
let birdWidth = 34;
let birdHeight = 24;
let birdX = boardWidth / 8;
let birdY = boardHeight / 2;
let birdImg;
// NEW: Animation variables
let birdAnimation = [];
let birdFrame = 0;
let frameCount = 0;

let bird = {
  x: birdX,
  y: birdY,
  width: birdWidth,
  height: birdHeight,
};

//pipes
let pipeArray = [];
let pipeWidth = 64;
let pipeHeight = 512;
let pipeX = boardWidth;
let pipeY = 0;
// NEW: Timer for pipe spawning (syncs with game speed)
let pipeSpawnTimer = 0;

let topPipeImg;
let bottomPipeImg;

//physics
let velocityX = -2;
let velocityY = 0;
let gravity = 0.4;

let gameOver = false;
let score = 0;

// Sound Effects
let flySound;
let scoreSound;
let hitSound;
let dieSound;

// NEW: UI Elements
let restartButton;
let aiControls;
let speedSlider;
let speedLabel;
let populationSlider;
let populationLabel;
let toggleAiButton;
let bestScoreDisplay;

window.onload = function () {
  board = document.getElementById("board");
  board.height = boardHeight;
  board.width = boardWidth;
  context = board.getContext("2d");

  //load images
  //load images
  // NEW: Load animation frames
  for (let i = 0; i < 4; i++) {
    let img = new Image();
    img.src = `./assets/images/flappybird${i}.png`;
    birdAnimation.push(img);
  }
  // Fallback/Initial image
  birdImg = birdAnimation[0];

  topPipeImg = new Image();
  topPipeImg.src = "./assets/images/toppipe.png";

  bottomPipeImg = new Image();
  bottomPipeImg.src = "./assets/images/bottompipe.png";

  // Load Sounds
  flySound = new Audio("./assets/sounds/sfx_wing.wav");
  scoreSound = new Audio("./assets:s/sounds/sfx_point.wav");
  hitSound = new Audio("./assets/sounds/sfx_hit.wav");
  dieSound = new Audio("./assets/sounds/sfx_die.wav");

  // NEW: Get UI Elements
  restartButton = document.getElementById("restartButton");
  aiControls = document.getElementById("aiControls");
  speedSlider = document.getElementById("speedSlider");
  speedLabel = document.getElementById("speedLabel");
  populationSlider = document.getElementById("populationSlider");
  populationLabel = document.getElementById("populationLabel");
  toggleAiButton = document.getElementById("toggleAiButton");
  bestScoreDisplay = document.getElementById("bestScoreDisplay");

  // NEW: Add Event Listeners
  restartButton.addEventListener("click", restartGame);
  
  toggleAiButton.addEventListener("click", () => {
      toggleAiMode();
  });

  speedSlider.addEventListener("input", (e) => {
    speedLabel.innerText = `${e.target.value}x`;
  });
  populationSlider.addEventListener("input", (e) => {
    populationLabel.innerText = e.target.value;
    // NEW: If AI is running, restart it with the new population
    if (aiMode) {
      initGA(parseInt(e.target.value));
    }
  });

  requestAnimationFrame(update);
  // REMOVED: setInterval(placePipes, 1500); -> Moved to update loop
  document.addEventListener("keydown", moveBird);
};

function update() {
  requestAnimationFrame(update);

  // NEW: Animation Logic (Run for both modes)
  frameCount++;
  if (frameCount % 5 === 0) { // Change frame every 5 ticks
      birdFrame = (birdFrame + 1) % 4;
      birdImg = birdAnimation[birdFrame];
  }

  // AI Mode
  if (aiMode) {
    context.clearRect(0, 0, board.width, board.height);

    // NEW: Get speed from slider
    let cycles = parseInt(speedSlider.value);

    // NEW: Run simulation logic multiple times for speed
    for (let n = 0; n < cycles; n++) {
      // Update pipes
      for (let i = 0; i < pipeArray.length; i++) {
        let pipe = pipeArray[i];
        pipe.x += velocityX;
      }

      // Clear pipes
      while (pipeArray.length > 0 && pipeArray[0].x < -pipeWidth) {
        pipeArray.shift();
      }

      // Update AI birds
      updateGA();

      // NEW: Spawn pipes based on frames (90 frames ~= 1500ms at 1x speed)
      pipeSpawnTimer++;
      if (pipeSpawnTimer >= 90) {
          placePipes();
          pipeSpawnTimer = 0;
      }
    }

    // NEW: Drawing happens only once per frame, outside the speed loop
    for (let i = 0; i < pipeArray.length; i++) {
      let pipe = pipeArray[i];
      context.drawImage(pipe.img, pipe.x, pipe.y, pipe.width, pipe.height);
    }
    drawGA(context, birdImg);

    return;
  }

  // Normal human play mode
  if (gameOver) {
    // NEW: Show restart button
    restartButton.classList.remove("hidden");
    return;
  }
  context.clearRect(0, 0, board.width, board.height);

  //bird
  //bird
  velocityY += gravity;
  bird.y = Math.max(bird.y + velocityY, 0);
  
  context.drawImage(birdImg, bird.x, bird.y, bird.width, bird.height);

  if (bird.y > board.height) {
    if (!gameOver) {
      dieSound.currentTime = 0;
      dieSound.play();
    }
    gameOver = true;
  }

  //pipes
  for (let i = 0; i < pipeArray.length; i++) {
    let pipe = pipeArray[i];
    pipe.x += velocityX;
    context.drawImage(pipe.img, pipe.x, pipe.y, pipe.width, pipe.height);

    if (!pipe.passed && bird.x > pipe.x + pipe.width) {
      score += 0.5;
      pipe.passed = true;
      scoreSound.currentTime = 0;
      scoreSound.play();
    }

    if (detectCollision(bird, pipe)) {
      if (!gameOver) {
        hitSound.currentTime = 0;
        hitSound.play();
      }
      gameOver = true;
    }
  }

  //clear pipes
  while (pipeArray.length > 0 && pipeArray[0].x < -pipeWidth) {
    pipeArray.shift();
  }

  // NEW: Spawn pipes based on frames
  pipeSpawnTimer++;
  if (pipeSpawnTimer >= 90) {
      placePipes();
      pipeSpawnTimer = 0;
  }

  //score
  context.fillStyle = "white";
  context.font = "45px sans-serif";
  context.fillText(score, 5, 45);

  if (gameOver) {
    context.fillText("GAME OVER", 5, 90);
  }
}

function placePipes() {
  if (gameOver && !aiMode) {
    return;
  }

  // NEW: Don't place pipes if AI is running and all birds are dead
  // (prevents pipes from spawning before new generation)
  if (aiMode && ga && ga.allDead()) {
    return;
  }

  let randomPipeY = pipeY - pipeHeight / 4 - Math.random() * (pipeHeight / 2);
  let openingSpace = board.height / 4;

  let topPipe = {
    img: topPipeImg,
    x: pipeX,
    y: randomPipeY,
    width: pipeWidth,
    height: pipeHeight,
    passed: false,
  };
  pipeArray.push(topPipe);

  let bottomPipe = {
    img: bottomPipeImg,
    x: pipeX,
    y: randomPipeY + pipeHeight + openingSpace,
    width: pipeWidth,
    height: pipeHeight,
    passed: false,
  };
  pipeArray.push(bottomPipe);
}

function toggleAiMode() {
    if (!aiMode) {
      // Switch to AI Mode
      aiControls.classList.remove("hidden");
      restartButton.classList.add("hidden"); // Hide restart button
      toggleAiButton.innerText = "DISABLE AI MODE";
      let popValue = parseInt(populationSlider.value);
      initGA(popValue);
      pipeSpawnTimer = 0; // Reset timer
    } else {
      // Switch to Human Mode
      aiControls.classList.add("hidden");
      toggleAiButton.innerText = "ENABLE AI MODE";
      aiMode = false;
      restartGame();
      pipeSpawnTimer = 0; // Reset timer
    }
}

function moveBird(e) {
  // Toggle AI mode with 'A' key
  if (e.code == "KeyA") {
    toggleAiMode();
    return;
  }

  if (aiMode) return; // Don't allow manual control in AI mode

  if (e.code == "Space" || e.code == "ArrowUp" || e.code == "KeyX") {
    //jump
    velocityY = -6;
    flySound.currentTime = 0;
    flySound.play();

    //reset game
    if (gameOver) {
      // NEW: Call restartGame function
      restartGame();
    }
  }
}

// NEW: Function to reset the human game
function restartGame() {
  bird.y = birdY;
  velocityY = 0;
  pipeArray = [];
  score = 0;
  gameOver = false;
  restartButton.classList.add("hidden");
  pipeSpawnTimer = 0; // Reset timer
}

function detectCollision(a, b) {
  // Make hitbox slightly smaller for better feel
  let padding = 4;
  return (
    a.x + padding < b.x + b.width &&
    a.x + a.width - padding > b.x &&
    a.y + padding < b.y + b.height &&
    a.y + a.height - padding > b.y
  );
}
