// main.js — Entry point: landing page, game start, tutorial start

import { GameRenderer } from './renderer.js';

window.addEventListener('load', () => {
  const canvas = document.getElementById('game-canvas');
  const overlay = document.getElementById('landing-overlay');
  const nameInput = document.getElementById('player-name');
  const playBtn = document.getElementById('play-btn');

  // Start background spectate game
  const bgRenderer = new GameRenderer(canvas, 'usa', null);
  bgRenderer.render();

  function startGame() {
    const name = nameInput.value.trim() || 'Player';
    bgRenderer.destroy();
    overlay.classList.add('hidden');
    const renderer = new GameRenderer(canvas, 'usa', name);
    renderer.render();
  }

  function startTutorialGame() {
    const name = nameInput.value.trim() || 'Player';
    bgRenderer.destroy();
    overlay.classList.add('hidden');
    const renderer = new GameRenderer(canvas, 'usa', name);
    renderer.initTutorial();
    renderer.render();
  }

  playBtn.addEventListener('click', startGame);
  const tutorialBtn = document.getElementById('tutorial-btn');
  tutorialBtn.addEventListener('click', startTutorialGame);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startGame(); });
  nameInput.focus();
});
