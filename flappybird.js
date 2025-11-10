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

window.onload = function () {
  board = document.getElementById("board");
  board.height = boardHeight;
  board.width = boardWidth;
  context = board.getContext("2d");

  //load images
  birdImg = new Image();
  birdImg.src = "./assets/images/flappybird.gif";
  birdImg.onload = function () {
    context.drawImage(birdImg, bird.x, bird.y, bird.width, bird.height);
  };

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

  // NEW: Add Event Listeners
  restartButton.addEventListener("click", restartGame);
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
  setInterval(placePipes, 1500);
  document.addEventListener("keydown", moveBird);
};

function update() {
  requestAnimationFrame(update);

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
    }

    // NEW: Drawing happens only once per frame, outside the speed loop
    for (let i = 0; i < pipeArray.length; i++) {
      let pipe = pipeArray[i];
      context.drawImage(pipe.img, pipe.x, pipe.y, pipe.width, pipe.height);
    }
    drawGA(context);

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

function moveBird(e) {
  // Toggle AI mode with 'A' key
  if (e.code == "KeyA") {
    if (!aiMode) {
      // NEW: Show controls and init GA with slider value
      aiControls.classList.remove("hidden");
      restartButton.classList.add("hidden"); // Hide restart button
      let popValue = parseInt(populationSlider.value);
      initGA(popValue);
    } else {
      // NEW: Hide controls
      aiControls.classList.add("hidden");
      aiMode = false;
      // NEW: Reset to human mode
      restartGame();
    }
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
}

function detectCollision(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
