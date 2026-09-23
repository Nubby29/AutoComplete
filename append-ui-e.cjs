document.querySelector('#app').innerHTML = `
  <header class="topbar"><a class="brand" href="."><span class="brand-mark">~</span><span>RUNBOOK</span></a><nav><a class="active" href="#runner">Automation</a><a href="#activity">Activity</a></nav><span class="connection"><i></i> local session</span></header>
  <main>
    <section class="intro" id="runner"><div><p class="eyebrow">GAME AUTOMATION / 01</p><h1>Let the agent<br><em>play it through.</em></h1></div><p class="lede">Choose a game and a finish line. The runner will observe the board, choose the next move, and keep going until the goal is reached.</p></section>
    <section class="workspace"><aside class="setup-panel"><div class="panel-heading"><span class="step">01</span><div><h2>Run setup</h2><p>Configure the session</p></div></div><label>GAME<select id="game-select">
      <option value="2048">2048 / Classic</option>
      <option value="minesweeper-beginner">Minesweeper / Beginner</option>
      <option value="minesweeper-intermediate">Minesweeper / Intermediate</option>
      <option value="minesweeper-expert">Minesweeper / Expert</option>
      <option value="sudoku-easy">Sudoku / NYT Easy</option>
      <option value="sudoku-medium">Sudoku / NYT Medium</option>
      <option value="sudoku-hard">Sudoku / NYT Hard</option>
      <option value="solitaire">Solitaire / LK Forge</option>
      <option value="pong-easy">Pong / Easy</option>
      <option value="pong-medium">Pong / Medium</option>
      <option value="pong-hard">Pong / Hard</option>
    </select></label><label>GOAL<select id="goal-select"></select></label><div class="target-note"><span class="target-icon">◎</span><div><strong>Target</strong><b id="target-label">2048</b></div><span class="status-pill">READY</span></div><button class="primary-button" id="run-button"><span class="play-icon">▶</span><span id="run-label">Run automation</span></button><a class="launch-link" id="launch-link" href="${gameUrl}" target="_blank" rel="noreferrer">Open game in new tab <span>↗</span></a><p class="hint">Run automation opens the selected game in Chrome and sends real inputs to it.</p></aside>
    <section class="board-panel"><div class="board-head"><div><span class="live-dot"></span><span id="run-status">Awaiting start</span></div><span class="board-meta" id="board-meta">4 × 4 BOARD</span></div><div class="board-wrap"><div class="board" id="board"></div><div class="board-overlay" id="board-overlay"><span>Press run to begin</span></div></div><div class="board-footer"><div><span class="metric-label">MOVES</span><strong id="move-count">0</strong></div><div><span class="metric-label">BEST TILE</span><strong id="best-tile">0</strong></div><div><span class="metric-label">ENGINE</span><b id="engine-label">Expectimax v2</b></div></div></section>
    <section class="activity" id="activity"><div class="activity-head"><div><p class="eyebrow">SESSION LOG</p><h2>What the agent is doing</h2></div><span class="log-state" id="log-state">IDLE</span></div><div class="log" id="log"><div class="log-row muted"><span class="log-time">--:--:--</span><span>Runner is ready for a new session.</span></div></div></section>
  </main><footer><span>RUNBOOK / AUTOMATION CONSOLE</span><span>Built for repeatable play</span></footer>`
