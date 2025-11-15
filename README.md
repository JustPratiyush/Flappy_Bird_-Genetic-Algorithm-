# Flappy Bird AI: Neuroevolution

This project is an implementation of the classic Flappy Bird game with a powerful twist: a self-learning AI that learns to play the game using a **Genetic Algorithm** and **Neural Networks**.

You can toggle between playing the game yourself and watching the AI train a population of birds across generations.

<p align="center">
  <img src="./screenshots/AI_Mode.png" height="300">
</p>

---

### 🎮 Features

- **Manual Play Mode:** Play the standard Flappy Bird game yourself.
- **AI Training Mode:** Press 'A' to toggle the AI mode. Watch hundreds or thousands of birds learn from scratch.
- **AI Controls:**

  - **Speed Slider:** Adjust the simulation speed from 1x to 20x to accelerate training.
  - **Population Slider:** Control the number of birds in each generation, from 10 to 10,000.

- **Live Stats:** The AI mode displays the current **Generation**, the number of **Alive** birds, and the **Best Score** achieved so far.

<p align="center">
  <img src="./screenshots/Normal_Mode.png" height="300">
</p>

---

### 🧠 How the AI Works

The AI combines a Neural Network (the "brain") with a Genetic Algorithm (the "learning" process).

#### 1. The Neural Network (The "Brain")

Each bird has its own brain, which is a simple feed-forward neural network. This network takes 5 inputs from the game environment and produces 2 outputs that decide whether to flap or not.

<p align="center">
  <img src="./screenshots/Nerual_Netowrk.png" height="280">
</p>

- **Inputs (5):**

  1. Bird's Y (vertical) position
  2. Bird's vertical velocity
  3. Horizontal distance to the next pipe
  4. Y position of the top pipe
  5. Y position of the bottom pipe

- **Hidden Layer (8):** An intermediate layer of 8 nodes.

- **Outputs (2):**

  1. **"Flap" score:** Confidence to flap
  2. **"Don't Flap" score:** Confidence to not flap

The bird takes whichever action has the higher score.

<p align="center">
  <img src="./screenshots/AI_Variables.png" height="280">
</p>

---

#### 2. The Genetic Algorithm (The "Learning")

The AI learns through simulated evolution over many **generations**:

1. **Initialization:** The program starts with a large population (e.g., 100 birds) of new `AIBird` objects, each with a randomly initialized neural network brain.
2. **Run Simulation:** All birds play the game simultaneously. The `think` function is called for each bird, and the `update` function moves the bird.
3. **Fitness Calculation:** When all birds have died, the algorithm calculates a "fitness" score for each one. This score is based on survival time and how many pipes were passed, with pipe-passing rewarded more heavily.
4. **Selection:**

   - **Elitism:** The best bird is copied directly into the next generation.
   - **Roulette Wheel Selection:** Birds with higher fitness are more likely to be chosen as parents.

5. **Mutation:** New “child” birds receive mutated copies of their parents’ neural network weights and biases.
6. **Repeat:** Over generations, birds become increasingly better at navigating the pipes.

---

### 🚀 How to Run

1. Clone the repository.
2. Open `index.html` in any modern web browser.

---

### 🕹️ Controls

- **Space / Arrow Up / X:** Flap (manual mode)
- **A:** Toggle between Manual and AI Training modes

---

### 💻 Technologies Used

- **HTML5:** Basic page structure
- **CSS3:** Styling for the game and UI
- **JavaScript (ES6+):**

  - `flappybird.js`: Game logic, physics, rendering, and collision detection
  - `geneticalgorithm.js`: `NeuralNetwork`, `AIBird`, and `GeneticAlgorithm` implementations
