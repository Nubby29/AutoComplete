import './style.css'

const gameUrl = 'https://2048game.com/?ref=google-search-classic'
const minesweeperUrl = 'https://minesweeperonline.com/'
const sudokuUrl = 'https://www.nytimes.com/puzzles/sudoku?eafs_enabled=false'
const solitaireUrl = 'https://lkforge.com/games/solitaire/'
const pongUrl = 'https://vygam.com/pong'
const goals = [128, 256, 512, 1024, 2048]
const directions = ['up', 'right', 'down', 'left']
let board = []
let moveCount = 0
let running = false
let runTimer
let pongState = null
let boardColumns = 4

document.querySelector('#app').innerHTML = `
  <header class="topbar"><a class="brand" href="."><span class="brand-mark">~</span><span>RUNBOOK</span></a><nav><a class="active" href="#runner">Automation</a><a href="#activity">Activity</a></nav><span class="connection"><i></i> local session</span></header>
  <main>
    <section class="intro" id="runner"><div><p class="eyebrow">GAME AUTOMATION / 01</p><h1>Let the agent<br><em>play it through.</em></h1></div><p class="lede">Choose a game and a finish line. The runner will observe the board, choose the next move, and keep going until the goal is reached.</p></section>
    <section class="workspace"><aside class="setup-panel"><div class="panel-heading"><span class="step">01</span><div><h2>Run setup</h2><p>Configure the session</p></div></div><label>GAME<select id="game-select"><option value="2048">2048 / Classic</option><option value="minesweeper-beginner">Minesweeper / Beginner</option><option value="minesweeper-intermediate">Minesweeper / Intermediate</option><option value="minesweeper-expert">Minesweeper / Expert</option><option value="sudoku-easy">Sudoku / NYT Easy</option><option value="sudoku-medium">Sudoku / NYT Medium</option><option value="sudoku-hard">Sudoku / NYT Hard</option><option value="solitaire">Solitaire / LK Forge</option>
      <option value="pong-easy">Pong / Easy</option>
      <option value="pong-medium">Pong / Medium</option>
      <option value="pong-hard">Pong / Hard</option></select></label><label>GOAL<select id="goal-select">${goals.map((goal) => `<option value="${goal}" ${goal === 2048 ? 'selected' : ''}>Reach the ${goal} tile</option>`).join('')}</select></label><div class="target-note"><span class="target-icon">◎</span><div><strong>Target tile</strong><b id="target-label">2048</b></div><span class="status-pill">READY</span></div><button class="primary-button" id="run-button"><span class="play-icon">▶</span><span id="run-label">Run automation</span></button><a class="launch-link" id="launch-link" href="${gameUrl}" target="_blank" rel="noreferrer">Open game in new tab <span>↗</span></a><p class="hint">Run automation opens the selected game in Chrome and sends real inputs to it.</p></aside><section class="board-panel"><div class="board-head"><div><span class="live-dot"></span><span id="run-status">Awaiting start</span></div><span class="board-meta" id="board-meta">4 × 4 BOARD</span></div><div class="board-wrap"><div class="board" id="board"></div><div class="board-overlay" id="board-overlay"><span>Press run to begin</span></div></div><div class="board-footer"><div><span class="metric-label">MOVES</span><strong id="move-count">0</strong></div><div><span class="metric-label">BEST TILE</span><strong id="best-tile">0</strong></div><div><span class="metric-label">ENGINE</span><strong id="engine-label">Expectimax v2</strong></div></div></section></section>
    <section class="activity" id="activity"><div class="activity-head"><div><p class="eyebrow">SESSION LOG</p><h2>What the agent is doing</h2></div><span class="log-state" id="log-state">IDLE</span></div><div class="log" id="log"><div class="log-row muted"><span class="log-time">--:--:--</span><span>Runner is ready for a new session.</span></div></div></section>
  </main><footer><span>RUNBOOK / AUTOMATION CONSOLE</span><span>Built for repeatable play</span></footer>`

const boardElement = document.querySelector('#board')
const overlay = document.querySelector('#board-overlay')
const moveElement = document.querySelector('#move-count')
const bestElement = document.querySelector('#best-tile')
const statusElement = document.querySelector('#run-status')
const logElement = document.querySelector('#log')
const runButton = document.querySelector('#run-button')

function newGame() { board = Array(16).fill(0); addTile(); addTile(); moveCount = 0; renderBoard() }
function addTile() { const empty = board.map((value, index) => value === 0 ? index : -1).filter((index) => index >= 0); if (empty.length) board[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4 }
function renderBoard() { boardElement.style.gridTemplateColumns = `repeat(${boardColumns}, minmax(0, 1fr))`; const labels = { '-1': '🚩' }; boardElement.innerHTML = board.map((value) => `<div class="tile tile-${value}">${value > 0 ? value : value === 0 ? '' : (labels[value] || value)}</div>`).join(''); moveElement.textContent = moveCount; const numeric = board.filter((value) => typeof value === 'number' && value > 0); bestElement.textContent = numeric.length ? Math.max(...numeric) : 0 }
function slide(line) { const values = line.filter(Boolean); for (let index = 0; index < values.length - 1; index += 1) if (values[index] === values[index + 1]) { values[index] *= 2; values.splice(index + 1, 1) }; while (values.length < 4) values.push(0); return values }
function move(direction, spawnTile = true) { const next = Array(16).fill(0); for (let line = 0; line < 4; line += 1) { const indexes = direction === 'left' ? [0, 1, 2, 3].map((column) => line * 4 + column) : direction === 'right' ? [3, 2, 1, 0].map((column) => line * 4 + column) : direction === 'up' ? [0, 1, 2, 3].map((row) => row * 4 + line) : [3, 2, 1, 0].map((row) => row * 4 + line); const result = slide(indexes.map((index) => board[index])); indexes.forEach((index, position) => { next[index] = result[position] }) }; const changed = next.some((value, index) => value !== board[index]); if (changed) { board = next; if (spawnTile) addTile(); moveCount += 1; renderBoard() }; return changed }
function chooseMove() { const weights = [65536, 32768, 16384, 8192, 512, 1024, 2048, 4096, 256, 128, 64, 32, 16, 8, 4, 2]; const scores = directions.map((direction) => { const before = [...board]; const changed = move(direction, false); const emptySpaces = board.filter((value) => value === 0).length; const weightedBoard = board.reduce((total, value, index) => total + (value ? Math.log2(value) * weights[index] : 0), 0); const score = changed ? emptySpaces * 10000 + weightedBoard : -Infinity; board = before; return { direction, score } }); return scores.sort((a, b) => b.score - a.score)[0].direction }
function log(message, tone = '') { const time = new Date().toLocaleTimeString([], { hour12: false }); logElement.insertAdjacentHTML('afterbegin', `<div class="log-row ${tone}"><span class="log-time">${time}</span><span>${message}</span></div>`) }
function stopRun(message, tone = 'success') { clearInterval(runTimer); running = false; runButton.classList.remove('running'); runButton.querySelector('#run-label').textContent = 'Run again'; document.querySelector('.status-pill').textContent = tone === 'success' ? 'COMPLETE' : 'STOPPED'; statusElement.textContent = message; document.querySelector('#log-state').textContent = tone === 'success' ? 'COMPLETE' : 'STOPPED' }
function runStep() { const goal = Number(document.querySelector('#goal-select').value); if (Math.max(...board) >= goal) return stopRun(`Goal reached: ${goal} tile`); const direction = chooseMove(); if (!move(direction)) return stopRun('No legal moves remain', 'stopped'); log(`Moved <strong>${direction}</strong> · scanning for the next best merge`) }
async function syncLiveStatus() { const response = await fetch('/api/status'); const live = await response.json(); board = live.board; moveCount = live.moves; boardRows = live.rows || 4; boardColumns = live.columns || 4; renderBoard(); document.querySelector('#board-meta').textContent = `${boardRows} × ${boardColumns} BOARD`; overlay.classList.add('hidden'); if (!live.running && running) stopRun(live.status, live.status.startsWith('Minesweeper cleared') || live.status.startsWith('Goal') || live.status.startsWith('Solitaire completed') || live.status.startsWith('Sudoku completed') ? 'success' : 'stopped'); if (live.running) { statusElement.textContent = live.status; document.querySelector('.status-pill').textContent = 'RUNNING'; document.querySelector('#log-state').textContent = 'RUNNING' } }
async function startRun() { if (running) { await fetch('/api/stop', { method: 'POST' }); return syncLiveStatus() } const selectedGame = document.querySelector('#game-select').value; const minesweeper = selectedGame.startsWith('minesweeper'); const sudoku = selectedGame.startsWith('sudoku'); const solitaire = selectedGame === 'solitaire'; running = true; overlay.classList.add('hidden'); runButton.classList.add('running'); runButton.querySelector('#run-label').textContent = 'Pause automation'; document.querySelector('.status-pill').textContent = 'RUNNING'; document.querySelector('#log-state').textContent = 'RUNNING'; statusElement.textContent = 'Opening live game'; log(`Session started · opening live ${solitaire ? 'Solitaire' : sudoku ? selectedGame.replace('sudoku-', '') + ' NYT Sudoku' : minesweeper ? selectedGame.replace('minesweeper-', '') + ' Minesweeper' : '2048'} game`, 'accent'); await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: selectedGame, goal: document.querySelector('#goal-select').value }) }); runTimer = setInterval(syncLiveStatus, 250); syncLiveStatus() }
document.querySelector('#game-select').addEventListener('change', (event) => { const minesweeper = event.target.value.startsWith('minesweeper'); const sudoku = event.target.value.startsWith('sudoku'); const solitaire = event.target.value === 'solitaire'; const difficulty = event.target.value.split('-')[1] || ''; document.querySelector('#goal-select').innerHTML = solitaire ? '<option value="complete">Complete Solitaire</option>' : sudoku ? `<option value="solve">Solve the NYT ${difficulty} Sudoku</option>` : minesweeper ? `<option value="clear">Clear the ${difficulty} board</option><option value="record">Beat the ${difficulty} #1 record (${difficulty === 'beginner' ? '1' : difficulty === 'intermediate' ? '16' : '52'}s)</option>` : goals.map((goal) => `<option value="${goal}" ${goal === 2048 ? 'selected' : ''}>Reach the ${goal} tile</option>`).join(''); document.querySelector('#target-label').textContent = solitaire ? 'Complete game' : sudoku ? 'Complete grid' : minesweeper ? 'All safe cells' : '2048'; document.querySelector('#launch-link').href = solitaire ? solitaireUrl : sudoku ? `${sudokuUrl.split('?')[0]}/${difficulty}?eafs_enabled=false` : minesweeper ? minesweeperUrl : gameUrl; document.querySelector('#engine-label').textContent = solitaire ? 'Klondike solver v1' : sudoku ? 'Backtracking solver v1' : minesweeper ? 'Constraint solver v1' : 'Expectimax v2' }); document.querySelector('#goal-select').addEventListener('change', (event) => { document.querySelector('#target-label').textContent = event.target.value === 'record' ? 'Beat #1 time' : event.target.value === 'clear' ? 'All safe cells' : event.target.value === 'solve' ? 'Complete grid' : event.target.value === 'complete' ? 'Complete game' : event.target.value }); runButton.addEventListener('click', startRun); newGame()

function isPong(value) {
  return value && value.startsWith('pong-')
}

function pongDifficulty(value) {
  return (value || '').replace(/^pong-/, '') || 'medium'
}

function pongRecordSeconds(difficulty) {
  return difficulty === 'beginner' ? '1' : difficulty === 'intermediate' ? '16' : '52'
}

function pongUrlForDifficulty(difficulty) {
  const q = new URLSearchParams()
  q.set('difficulty', difficulty || 'medium')
  return `${pongUrl}?${q.toString()}`
}

function updateGoalSelect(selectedGame) {
  const minesweeper = selectedGame.startsWith('minesweeper')
  const sudoku = selectedGame.startsWith('sudoku')
  const solitaire = selectedGame === 'solitaire'
  const pong = isPong(selectedGame)

  if (solitaire) {
    goalSelect.innerHTML = '<option value="complete">Complete Solitaire</option>'
  } else if (pong) {
    goalSelect.innerHTML = '<option value="7">First to 7 points wins the match</option>'
  } else if (sudoku) {
    goalSelect.innerHTML = `<option value="solve">Solve the NYT ${pongDifficulty(selectedGame)} Sudoku</option>`
  } else if (minesweeper) {
    goalSelect.innerHTML = `<option value="clear">Clear the ${pongDifficulty(selectedGame)} board</option><option value="record">Beat the ${pongDifficulty(selectedGame)} #1 record (${pongRecordSeconds(pongDifficulty(selectedGame))}s)</option>`
  } else {
    goalSelect.innerHTML = goals
      .map(
        (goal) => `<option value="${goal}" ${goal === 2048 ? 'selected' : ''}>Reach the ${goal} tile</option>`
      )
      .join('')
  }

  targetLabel.textContent = solitaire
    ? 'Complete game'
    : pong
      ? 'First to 7'
      : sudoku
        ? 'Complete grid'
        : minesweeper
          ? 'All safe cells'
          : '2048'

  launchLink.href = solitaire
    ? solitaireUrl
    : pong
      ? pongUrlForDifficulty(pongDifficulty(selectedGame))
      : sudoku
        ? `${sudokuUrl.split('?')[0]}/${pongDifficulty(selectedGame)}?eafs_enabled=false`
        : minesweeper
          ? minesweeperUrl
          : gameUrl

  engineLabel.textContent = solitaire
    ? 'Klondike solver v1'
    : pong
      ? 'Pong controller v1'
      : sudoku
        ? 'Backtracking solver v1'
        : minesweeper
          ? 'Constraint solver v1'
          : 'Expectimax v2'
}

async function syncLiveStatus() {
  const response = await fetch('/api/status')
  const live = await response.json()

  if (isPong(live.game)) {
    pongState = {
      scoreMy: typeof live.pongScoreMy === 'number' ? live.pongScoreMy : 0,
      scoreCpu: typeof live.pongScoreCpu === 'number' ? live.pongScoreCpu : 0,
      statusText: typeof live.status === 'string' ? live.status : ''
    }
    if (boardMeta)
      boardMeta.textContent = `PONG · ${formatPongScore(pongState.scoreMy)} - ${formatPongScore(pongState.scoreCpu)}`
    statusElement.textContent = live.status || statusElement.textContent
    overlay.classList.add('hidden')
    moveElement.textContent = live.pongMoves != null ? live.pongMoves : 0
    bestElement.textContent = pongState.scoreMy
    if (!live.running && running) {
      stopRun(
        live.status || 'stopped',
        live.status && live.status.startsWith('Pong completed') ? 'success' : 'stopped'
      )
    }
    if (live.running) {
      document.querySelector('.status-pill').textContent = 'RUNNING'
      logState.textContent = 'RUNNING'
    }
    return
  }

  board = live.board
  moveCount = live.moves
  bestTile = live.best
  boardRows = live.rows || 4
  boardColumns = live.columns || 4
  boardMeta.textContent = live.game?.startsWith('minesweeper')
    ? '9 × 9 MINE FIELD'
    : live.game?.startsWith('sudoku')
      ? '9 × 9 GRID'
      : `${boardRows} × ${boardColumns} BOARD`
  overlay.classList.add('hidden')
  moveElement.textContent = live.moves
  bestElement.textContent = live.best

  if (!live.running && running) {
    stopRun(
      live.status,
      live.status?.startsWith('Minesweeper cleared') ||
        live.status?.startsWith('Goal') ||
        live.status?.startsWith('Solitaire completed') ||
        live.status?.startsWith('Sudoku completed') ||
        live.status?.startsWith('Pong completed')
        ? 'success'
        : 'stopped'
    )
  }
  if (live.running) {
    statusElement.textContent = live.status
    document.querySelector('.status-pill').textContent = 'RUNNING'
    logState.textContent = 'RUNNING'
  }
}

async function startRun() {
  if (running) {
    await fetch('/api/stop', { method: 'POST' })
    return syncLiveStatus()
  }

  const selectedGame = document.querySelector('#game-select').value

  running = true
  overlay.classList.add('hidden')
  runButton.classList.add('running')
  runLabel.textContent = 'Pause automation'
  document.querySelector('.status-pill').textContent = 'RUNNING'
  logState.textContent = 'RUNNING'
  statusElement.textContent = 'Opening live game'

  const gameName =
    selectedGame === 'solitaire'
      ? 'Solitaire'
      : isPong(selectedGame)
        ? 'Pong'
        : selectedGame.startsWith('sudoku')
          ? `${selectedGame.replace('sudoku-', '')} NYT Sudoku`
          : selectedGame.startsWith('minesweeper')
            ? selectedGame.replace('minesweeper-', '').replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' Minesweeper'
            : '2048'

  log(`Session started · opening live ${gameName} game`, 'accent')

  await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      game: selectedGame,
      goal: document.querySelector('#goal-select').value
    })
  })

  runTimer = setInterval(syncLiveStatus, 250)
  syncLiveStatus()
}

function stopRun(message, kind) {
  running = false
  clearInterval(runTimer)
  runButton.classList.remove('running')
  runLabel.textContent = 'Run automation'
  document.querySelector('.status-pill').textContent = 'READY'
  logState.textContent = 'IDLE'
  statusElement.textContent = message || 'Stopped'
  log(`Session ended · ${message}`, kind === 'success' ? 'accent' : 'muted')
}

function onGoalChange() {
  const value = document.querySelector('#goal-select').value
  targetLabel.textContent =
    value === 'record'
      ? 'Beat #1 time'
      : value === 'clear'
        ? 'All safe cells'
        : value === 'solve'
          ? 'Complete grid'
          : value === 'complete'
            ? 'Complete game'
            : value === '7'
              ? 'First to 7'
              : value
}

document.querySelector('#game-select').addEventListener('change', () =>
  updateGoalSelect(document.querySelector('#game-select').value)
)
document.querySelector('#goal-select').addEventListener('change', onGoalChange)
runButton.addEventListener('click', startRun)
updateGoalSelect(document.querySelector('#game-select').value)
