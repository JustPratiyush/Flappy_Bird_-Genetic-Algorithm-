// Genetic Algorithm for Flappy Bird AI
class NeuralNetwork {
  // ... (No changes in this class)
  constructor(inputNodes, hiddenNodes, outputNodes) {
    this.inputNodes = inputNodes;
    this.hiddenNodes = hiddenNodes;
    this.outputNodes = outputNodes;

    // Initialize weights randomly
    this.weightsIH = this.randomMatrix(this.hiddenNodes, this.inputNodes);
    this.weightsHO = this.randomMatrix(this.outputNodes, this.hiddenNodes);
    this.biasH = this.randomMatrix(this.hiddenNodes, 1);
    this.biasO = this.randomMatrix(this.outputNodes, 1);
  }

  randomMatrix(rows, cols) {
    let matrix = [];
    for (let i = 0; i < rows; i++) {
      matrix[i] = [];
      for (let j = 0; j < cols; j++) {
        matrix[i][j] = Math.random() * 2 - 1; // Random between -1 and 1
      }
    }
    return matrix;
  }

  feedForward(inputArray) {
    // Convert input to matrix
    let inputs = inputArray.map((x) => [x]);

    // Calculate hidden layer
    let hidden = this.matrixMultiply(this.weightsIH, inputs);
    hidden = this.matrixAdd(hidden, this.biasH);
    hidden = this.matrixMap(hidden, this.sigmoid);

    // Calculate output layer
    let output = this.matrixMultiply(this.weightsHO, hidden);
    output = this.matrixAdd(output, this.biasO);
    output = this.matrixMap(output, this.sigmoid);

    // Return both output values as an array [flap_score, dont_flap_score]
    return [output[0][0], output[1][0]];
  }

  sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  matrixMultiply(a, b) {
    let result = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = [];
      for (let j = 0; j < b[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < a[0].length; k++) {
          sum += a[i][k] * b[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  matrixAdd(a, b) {
    let result = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = [];
      for (let j = 0; j < a[0].length; j++) {
        result[i][j] = a[i][j] + b[i][j];
      }
    }
    return result;
  }

  matrixMap(matrix, func) {
    let result = [];
    for (let i = 0; i < matrix.length; i++) {
      result[i] = [];
      for (let j = 0; j < matrix[0].length; j++) {
        result[i][j] = func(matrix[i][j]);
      }
    }
    return result;
  }

  copy() {
    let nn = new NeuralNetwork(
      this.inputNodes,
      this.hiddenNodes,
      this.outputNodes
    );
    nn.weightsIH = this.copyMatrix(this.weightsIH);
    nn.weightsHO = this.copyMatrix(this.weightsHO);
    nn.biasH = this.copyMatrix(this.biasH);
    nn.biasO = this.copyMatrix(this.biasO);
    return nn;
  }

  copyMatrix(matrix) {
    return matrix.map((row) => [...row]);
  }

  mutate(mutationRate, mutationAmount) {
    this.weightsIH = this.mutateMatrix(
      this.weightsIH,
      mutationRate,
      mutationAmount
    );
    this.weightsHO = this.mutateMatrix(
      this.weightsHO,
      mutationRate,
      mutationAmount
    );
    this.biasH = this.mutateMatrix(this.biasH, mutationRate, mutationAmount);
    this.biasO = this.mutateMatrix(this.biasO, mutationRate, mutationAmount);
  }

  mutateMatrix(matrix, mutationRate, mutationAmount) {
    return matrix.map((row) =>
      row.map((val) => {
        if (Math.random() < mutationRate) {
          return val + (Math.random() * 2 - 1) * mutationAmount;
        }
        return val;
      })
    );
  }
}

class AIBird {
  constructor(brain) {
    this.x = boardWidth / 8;
    this.y = boardHeight / 2;
    this.width = birdWidth;
    this.height = birdHeight;
    this.velocityY = 0;
    this.alive = true;

    this.framesAlive = 0;
    this.fitness = 0;

    // **CHANGED: Added score tracking for each bird**
    this.score = 0;
    this.passedPipes = new Set(); // To track which pipes this bird has passed

    this.brain = brain || new NeuralNetwork(5, 8, 2);
  }

  think(pipes) {
    // ... (No changes in this function)
    let closestPipe = null;
    let closestDist = Infinity;

    for (let pipe of pipes) {
      if (pipe.x + pipe.width > this.x && pipe.x < closestDist) {
        closestDist = pipe.x;
        closestPipe = pipe;
      }
    }

    if (closestPipe) {
      let inputs = [
        this.y / boardHeight,
        this.velocityY / 10,
        (closestPipe.x - this.x) / boardWidth,
        (closestPipe.y + pipeHeight) / boardHeight,
        (closestPipe.y + pipeHeight + boardHeight / 4) / boardHeight,
      ];

      let output = this.brain.feedForward(inputs);

      if (output[0] > output[1]) {
        this.jump();
      }
    }
  }

  jump() {
    this.velocityY = -6;
  }

  update() {
    if (!this.alive) return;

    this.velocityY += gravity;
    this.y = Math.max(this.y + this.velocityY, 0);

    if (this.y > boardHeight || this.y < 0) {
      this.alive = false;
    }

    this.framesAlive++;
  }

  checkCollision(pipe) {
    if (!this.alive) return;

    if (
      this.x < pipe.x + pipe.width &&
      this.x + this.width > pipe.x &&
      this.y < pipe.y + pipe.height &&
      this.y + this.height > pipe.y
    ) {
      this.alive = false;
    }
  }
}

class GeneticAlgorithm {
  constructor(populationSize, mutationRate = 0.1, mutationAmount = 0.5) {
    this.populationSize = populationSize;
    this.population = [];
    this.generation = 1;
    this.bestFitness = 0;
    // **CHANGED: Track best score (pipes passed)**
    this.bestScore = 0;
    this.mutationRate = mutationRate;
    this.mutationAmount = mutationAmount;

    for (let i = 0; i < this.populationSize; i++) {
      this.population.push(new AIBird());
    }
  }

  update(pipes) {
    for (let bird of this.population) {
      if (bird.alive) {
        bird.think(pipes);
        bird.update();

        for (let pipe of pipes) {
          bird.checkCollision(pipe);

          // **CHANGED: New scoring logic for each bird**
          // We check `pipe.y < 0` to only count top pipes (scoring 1 per pair)
          if (pipe.y < 0 && !bird.passedPipes.has(pipe)) {
            if (bird.x > pipe.x + pipe.width) {
              bird.score++;
              bird.passedPipes.add(pipe);
            }
          }
        }
      }
    }
  }

  allDead() {
    return this.population.every((bird) => !bird.alive);
  }

  nextGeneration() {
    let maxFitness = 0;
    let bestBird = this.population[0];
    let currentBestScore = 0;

    for (let bird of this.population) {
      // **CHANGED: New Fitness Function**
      // Exponentially reward score (pipes passed)
      // Linearly reward framesAlive (as a tie-breaker)
      bird.fitness = bird.framesAlive + Math.pow(2, bird.score) * 1000;

      if (bird.fitness > maxFitness) {
        maxFitness = bird.fitness;
        bestBird = bird;
      }
      if (bird.score > currentBestScore) {
        currentBestScore = bird.score;
      }
    }

    // Update the all-time best score
    if (currentBestScore > this.bestScore) {
      this.bestScore = currentBestScore;
    }

    // Handle case where all birds die instantly
    if (maxFitness === 0) {
      this.population = [];
      for (let i = 0; i < this.populationSize; i++) {
        this.population.push(new AIBird());
      }
      this.generation++;
      return;
    }

    // Create a breeding pool (only birds that survived at all)
    let breedingPool = this.population.filter((bird) => bird.fitness > 0);
    for (let bird of breedingPool) {
      bird.fitness = bird.fitness / maxFitness; // Normalize
    }

    if (breedingPool.length === 0) {
      this.population = [];
      for (let i = 0; i < this.populationSize; i++) {
        this.population.push(new AIBird());
      }
      this.generation++;
      return;
    }

    // Create new population
    let newPopulation = [];

    // Elitism: Add the best bird from last gen, unchanged
    let eliteChild = new AIBird(bestBird.brain.copy());
    newPopulation.push(eliteChild);

    // Create the rest
    for (let i = 1; i < this.populationSize; i++) {
      let parent = this.selectParent(breedingPool);
      let child = new AIBird(parent.brain.copy());
      child.brain.mutate(this.mutationRate, this.mutationAmount);
      newPopulation.push(child);
    }

    this.population = newPopulation;
    this.generation++;
  }

  selectParent(breedingPool) {
    // Roulette wheel selection
    let r = Math.random();
    let totalFitness = breedingPool.reduce(
      (acc, bird) => acc + bird.fitness,
      0
    );
    r *= totalFitness;

    let runningSum = 0;
    for (let i = 0; i < breedingPool.length; i++) {
      runningSum += breedingPool[i].fitness;
      if (runningSum > r) {
        return breedingPool[i];
      }
    }
    return breedingPool[breedingPool.length - 1];
  }

  draw(context, birdImg) {
    for (let bird of this.population) {
      if (bird.alive) {
        context.drawImage(birdImg, bird.x, bird.y, bird.width, bird.height);
      }
    }
  }

  getStats() {
    let alive = this.population.filter((b) => b.alive).length;
    return {
      generation: this.generation,
      alive: alive,
      // **CHANGED: Report the best score**
      bestScore: this.bestScore,
    };
  }
}

// Global GA instance
let ga;
let aiMode = false;

// NEW: initGA now takes populationSize as an argument
function initGA(populationSize) {
  // NEW: Use the provided populationSize
  ga = new GeneticAlgorithm(populationSize, 0.1, 0.5);
  aiMode = true;
  gameOver = false;
  pipeArray = [];
  score = 0; // This `score` is for the human player, it's not used by the AI
}

function updateGA() {
  if (!aiMode || !ga) return;

  ga.update(pipeArray);

  if (ga.allDead()) {
    ga.nextGeneration();
    pipeArray = [];
  }
}

function drawGA(context, birdImg) {
  if (!aiMode || !ga) return;

  ga.draw(context, birdImg);

  let stats = ga.getStats();
  context.fillStyle = "white";
  context.font = "20px sans-serif";
  context.fillText(`Gen: ${stats.generation}`, 5, 25);
  context.fillText(`Alive: ${stats.alive}/${ga.populationSize}`, 5, 50);
  // **CHANGED: Display the best score**
  context.fillText(`Best Score: ${stats.bestScore}`, 5, 75);
}
