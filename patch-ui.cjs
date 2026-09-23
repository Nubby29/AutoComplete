const fs = require('fs')
const file = 'src/main.js'
let t = fs.readFileSync(file, 'utf8')

function replaceOnce(t, before, after) {
  const i = t.indexOf(before)
  if (i < 0) {
    console.log('missing anchor:', before.slice(0, 80))
    process.exit(1)
  }
  return t.slice(0, i) + after + t.slice(i + before.length)
}

// Add Pong goal option into the dynamic goal-select rebuild inside the select change handler
t = replaceOnce(t,
  `solitaire ? '<option value="complete">Complete Solitaire</option>' : sudok`,
  `solitaire ? '<option value="complete">Complete Solitaire</option>' : pongGame ? '<option value="7">First to 7 wins</option>' : sudok`
)

// Add pongGame detection right after solitaire const in that same handler
t = replaceOnce(t,
  `const solitaire = event.target.value === 'solitaire';`,
  `const solitaire = event.target.value === 'solitaire';
  const pongGame = event.target.value && event.target.value.startsWith('pong-');`
)

// Add Pong target label branch in the same handler
t = replaceOnce(t,
  `solitaire ? 'Complete game' : sudoku`,
  `solitaire ? 'Complete game' : pongGame ? 'First to 7' : sudoku`
)

// Add Pong launch link branch in the same handler
t = replaceOnce(t,
  `sudoku ? \`${sudokuUrl.split('?')[0]}/${difficulty}?eafs_enabled=false\` : minesweeper`,
  `sudoku ? \`${sudokuUrl.split('?')[0]}/${difficulty}?eafs_enabled=false\` : pongGame ? pongUrlForDifficulty(difficulty) : minesweeper`
)

// Add Pong engine label branch in the same handler
t = replaceOnce(t,
  `minesweeper ? 'Constraint solver v1' : 'Expectimax v2'`,
  `minesweeper ? 'Constraint solver v1' : pongGame ? 'Pong controller v1' : 'Expectimax v2'`
)

// Add pongUrlForDifficulty helper before the first addEventListener near end of file
t = replaceOnce(t,
  `document.querySelector('#game-select').addEventListener('change',`,
  `function pongUrlForDifficulty(difficulty) {
  const q = new URLSearchParams()
  q.set('difficulty', difficulty || 'medium')
  return \`\${pongUrl}?\${q.toString()}\`
}

document.querySelector('#game-select').addEventListener('change',`
)

// Add pong game detection + pong status rendering inside syncLiveStatus
// Insert pong detection right after live status is fetched
t = replaceOnce(t,
  `const live = await response.json();`,
  `const live = await response.json();
  const pongGameLive = live.game && live.game.startsWith('pong-');`
)

// Insert pong status branch right after board meta is set for non-pong case
t = replaceOnce(t,
  `boardMeta.textContent = \`${boardRows} × ${boardColumns} BOARD\`;`,
  `if (pongGameLive) {
    boardMeta.textContent = \`PONG · \${live.pongScoreMy ?? 0} - \${live.pongScoreCpu ?? 0}\`;
    statusElement.textContent = live.status || statusElement.textContent;
    moveElement.textContent = live.pongMoves != null ? live.pongMoves : 0;
    bestElement.textContent = typeof live.pongScoreMy === 'number' ? live.pongScoreMy : 0;
    overlay.classList.add('hidden');
    if (!live.running && running) {
      stopRun(live.status || 'stopped', live.status && live.status.startsWith('Pong completed') ? 'success' : 'stopped');
    }
    if (live.running) {
      document.querySelector('.status-pill').textContent = 'RUNNING';
      logState.textContent = 'RUNNING';
    }
    return;
  }
  boardMeta.textContent = \`${boardRows} × ${boardColumns} BOARD\`;`
)

// Add pongGame detection in startRun log line
t = replaceOnce(t,
  `const solitaire = selectedGame === 'solitaire';`,
  `const solitaire = selectedGame === 'solitaire';
  const pongGame = selectedGame && selectedGame.startsWith('pong-');`
)

// Update startRun log to mention Pong
t = replaceOnce(t,
  `solitaire ? 'Solitaire' : sudoku ? selectedGame.replace('sudoku-', '') + ' NYT Sudoku' : minesweeper ? selectedGame.replace('minesweeper-', '').replace('-', ' ').replace(/\\b\\w/g, c => c.toUpperCase()) + ' Minesweeper' : '2048'`,
  `solitaire ? 'Solitaire' : pongGame ? selectedGame.replace('pong-', '').toUpperCase() + ' Pong' : sudoku ? selectedGame.replace('sudoku-', '') + ' NYT Sudoku' : minesweeper ? selectedGame.replace('minesweeper-', '').replace('-', ' ').replace(/\\b\\w/g, c => c.toUpperCase()) + ' Minesweeper' : '2048'`
)

// Update success detection to include Pong completed
t = replaceOnce(t,
  `live.status?.startsWith('Sudoku completed') ? 'success' : 'stopped'`,
  `live.status?.startsWith('Sudoku completed') || live.status?.startsWith('Pong completed') ? 'success' : 'stopped'`
)

fs.writeFileSync(file, t, 'utf8')
console.log('patched src/main.js OK')
