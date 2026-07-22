const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const games = {};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create or join a game room
  socket.on('findGame', () => {
    let gameId = null;
    
    // Find available game (waiting for player)
    for (let id in games) {
      if (games[id].players.length === 1) {
        gameId = id;
        break;
      }
    }

    if (!gameId) {
      // Create new game
      gameId = Math.random().toString(36).substring(7);
      games[gameId] = {
        players: [socket.id],
        board: Array(9).fill(null),
        currentTurn: socket.id,
        xPlayer: socket.id
      };
      socket.join(gameId);
      socket.emit('gameCreated', { gameId, symbol: 'X' });
      console.log(`Game ${gameId} created by ${socket.id}`);
    } else {
      // Join existing game
      games[gameId].players.push(socket.id);
      socket.join(gameId);
      socket.emit('gameJoined', { 
        gameId, 
        symbol: 'O',
        board: games[gameId].board 
      });
      
      // Notify both players game is starting
      io.to(gameId).emit('gameStart', {
        board: games[gameId].board,
        currentTurn: games[gameId].xPlayer
      });
      console.log(`Game ${gameId} started with ${games[gameId].players}`);
    }
  });

  // Handle moves
  socket.on('makeMove', ({ gameId, index }) => {
    const game = games[gameId];
    if (!game) return;

    // Validate turn
    if (game.currentTurn !== socket.id) {
      socket.emit('error', 'Not your turn!');
      return;
    }

    // Validate move
    if (game.board[index] !== null) {
      socket.emit('error', 'Cell already taken!');
      return;
    }

    // Get player's symbol
    const symbol = game.players[0] === socket.id ? 'X' : 'O';
    game.board[index] = symbol;

    // Check win
    const winner = checkWinner(game.board);
    if (winner) {
      io.to(gameId).emit('gameOver', { 
        winner, 
        board: game.board,
        winningCombo: winner.combo 
      });
      delete games[gameId];
      return;
    }

    // Check draw
    if (!game.board.includes(null)) {
      io.to(gameId).emit('gameOver', { winner: 'draw', board: game.board });
      delete games[gameId];
      return;
    }

    // Switch turns
    game.currentTurn = game.players.find(id => id !== socket.id);
    io.to(gameId).emit('moveMade', { 
      board: game.board, 
      currentTurn: game.currentTurn 
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    for (let gameId in games) {
      const game = games[gameId];
      if (game.players.includes(socket.id)) {
        io.to(gameId).emit('playerLeft', 'Opponent disconnected!');
        delete games[gameId];
        console.log(`Game ${gameId} closed due to disconnect`);
      }
    }
  });
});

// Win detection
function checkWinner(board) {
  const winPatterns = [
    [0,1,2], [3,4,5], [6,7,8], // rows
    [0,3,6], [1,4,7], [2,5,8], // columns
    [0,4,8], [2,4,6] // diagonals
  ];

  for (let pattern of winPatterns) {
    const [a,b,c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { player: board[a], combo: pattern };
    }
  }
  return null;
}

server.listen(process.env.PORT || 3000, () => {
  console.log('Server running! 🎮');
});