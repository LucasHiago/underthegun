'use strict';
var pokerApp = angular.module('poker-app', []).
    config(['$routeProvider', function($routeProvider) {
        $routeProvider.
            when('', {templateUrl: 'partials/lobby.html', controller: LobbyCtrl}).
            when('/game', {templateUrl: 'partials/game.html', controller: PokerCtrl}).
            otherwise({redirectTo: ''});
    }]);


pokerApp.factory('gameHolder', function() {
    var _gameData;
    return {
        gameData: function() {
            return _gameData;
        },
        newGame: function(gameData) {
            _gameData = gameData;
        }
    }
});


pokerApp.factory('Socket', function($rootScope) {
    var socket = io.connect('http://localhost:4001/game');

    // Override socket.on to $apply the changes to angular.
    return {
        on: function(eventName, fn) {
            socket.on(eventName, function(gs) {
                $rootScope.$apply(function() {
                    fn(gs);
                });
            });
        },
        emit: function(eventName, data) {
            socket.emit(eventName, data);
        }
    };
})




function PokerCtrl($scope, Socket, gameHolder) {

    Socket.emit('new-game', gameHolder.gameData());

    Socket.on('assign-seat', function(data) {
        $scope.seat = data.seat;
        $scope.opponentSeat = data.seat == 0 ? 1 : 0;
    });

    // Start game.
    Socket.on('new-game', function(gs) {
        $scope.gs = gs;
        // Initialize bet slider.
        $('.bet-slider')
            .attr('min', gs.minRaiseTo)
            .attr('max', gs.players[$scope.seat].chips)
            .attr('value', 3 * gs.bigBlind)
            .attr('step', 10)
            .on('change', function() {
                $('#bet-amount').text($('.bet-slider').attr('value'));
            });
    });

    // Start hand.
    Socket.on('new-hand', function(gs) {
        $scope.gs = gs;
    });

    Socket.on('next-turn', function(gs) {
        updateValues(gs);
        $scope.gs = gs;
        getAndEmitAction(gs, Socket);
    });

    Socket.on('next-round', function(gs) {
        updateValues(gs);
        getAndEmitAction(gs, Socket);
    });

    Socket.on('all-in', function(gs) {
        updateValues(gs);
    });

    Socket.on('hand-complete', function(gs) {
        var wait = updateValues(gs);
        setTimeout(function() {
            Socket.emit('hand-complete', {gs: gs})
        }, wait || 0);
    });

    Socket.on('game-over', function(gs) {
        gameOver(gs);
    });

    Socket.on('game-over-dc', function(gs) {
        gameOver(gs, true);
    });

    socketBinded = true;
}



function LobbyCtrl($scope, $location, gameHolder) {
    $scope.findGame = function() {
        // Connect to the match-making system.
        if (!enableFindGame) {
            return;
        }

        $('#find-game').text('Finding game...').addClass('inactive');
        notify('Searching for an opponent...');
        enableFindGame = false;

        if (!socket) {
            socket = io.connect('http://localhost:4001/matchmaking',
                                {'connect timeout': 8000});

            socket.on('connect_failed', function() {
                // Could not connect to server.
                $('#find-game').text('Find Game').removeClass('inactive');
                notify('Sorry, the server seems to be down.');
                enableFindGame = true;
            });

            // Server will tell us what our player id is if we don't have one.
            socket.on('assign-player-id', function(data) {
                playerId = data.playerId;
            });

            // Match found, start a game.
            socket.on('match-found', function(data) {
                gameHolder.newGame(data);
                $location.path("/game");
                $scope.$apply()
            });
        }

        socket.emit('find-match', { playerId: playerId });
    };
}
