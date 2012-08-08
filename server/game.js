// Start up hand server.
var http = require('http').createServer(function(request, response) {
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end('Hello World');
}).listen(8433);

// Connect to DB.
var mysql = require("db-mysql");
new mysql.Database({
    "hostname": "localhost",
    "user": "root",
    "password": "yoursql",
    "database": "underthegun"
}).connect(function(error) {
    if (error) {
        return console.log('Database connection error: ' + error);
    }
});

var holdem = require('./holdem');

// Global vars. Games and hands hold games/hands in progress which should then
// be saved to DB on completion.
var clients = {};
var gameStates = {}
var numGames = 0;

var io = require('socket.io').listen(http);
io.sockets.on('connection', function(socket) {
    var seat, seat1Id, playerId, gameId;

    socket.on('new-game', function(data) {
        // Set up game.
        seat = data.seat;
        seat1Id = seat == 'seat1' ? data.heroId : data.villainId;
        playerId = data.heroId;
        clients[playerId] = socket;

        // Have only one player's socket initialize the game state into the
        // global object.
        if (seat == 'seat1') {
            var gs = new holdem.Gs();
            gs.gameId = numGames++;
            gs.seat1Id = data.heroId;
            gs.seat2Id = data.villainId;

            // Store it in a global object so both sockets can access it via
            // the game id (which will be handed out soon).
            gameStates[seat1Id] = gs;

            emitGsAll('new-game');
            newHand();
        }

        socket.on('preflop-action', function(data) {
            console.log('preflop-action ' + data.action);
            // TODO: verify game state
            var handStatus = gs.applyAction(gs, data.action);
            if ('hand-complete' in handStatus) {
                emitGsAll('hand-complete');
            }
        });

        socket.on('hand-complete', function(data) {
            // TODO: verify game state (check if game state has winner)
        });

        function newHand() {
            if (seat == 'seat1') {
                gsSet('seat1Hole', gsGet('deck').draw(2));
                gsSet('seat2Hole', gsGet('deck').draw(2));
                emitGsAll('new-hand');
            }
        }

        function emitGsAll(eventName) {
            clients[gs.seat1Id].emit(eventName, gs.filter('seat1'));
            clients[gs.seat2Id].emit(eventName, gs.filter('seat2'));
        }

        function gsGet(k) {
            return gameStates[seat1Id][k];
        }

        function gsSet(k, v) {
            gameStates[seat1Id][k] = v;
        }
    });
});

function f() { return false; }
console.log('Server running at localhost:8433');
