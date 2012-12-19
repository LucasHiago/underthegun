var c = require('./constants');


/*
DECK AND CARDS
*/
var Deck = function() {
    this.deck = createDeck();
    this.shuffle();
}

Deck.prototype.draw = function(n) {
    if (!n || n == 1) {
        return this.deck.pop();
    }
    return this.deck.splice(0, n);
}

Deck.prototype.shuffle = function() {
    var tmp, current, top = this.deck.length;

    if(top) while(--top) {
        current = Math.floor(Math.random() * (top + 1));
        tmp = this.deck[current];
        this.deck[current] = this.deck[top];
        this.deck[top] = tmp;
    }

    return this.deck;
}

function createDeck() {
    // Returns a shuffled deck.
    var ranks = [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'],
                 [7, '7'], [8, '8'], [9, '9'], [10, 'T'], [11, 'J'],
                 [12, 'Q'], [13, 'K'], [14, 'A']];
    var suits = ['c', 'd', 'h', 's'];

    var deck = [];
    for (var i = 0; i < ranks.length; i++) {
        for (var j = 0; j < suits.length; j++) {
            deck.push({
                // Card.
                card: ranks[i][1] + suits[j],
                rank: ranks[i][0],
                suit: suits[j],
                strRank: ranks[i][1]
            });
        }
    }
    return deck;
}

var Player = function(id) {
    this.id = id;
    this.seat = null;
    this.chips = null;
    this.hole = [];
    this.roundPIP = 0;  // How much player has put into pot for current round.
}

/*
GAME STATE
*/
var Gs = function(gameId) {
    this.gameId = gameId;
    this.deck = new Deck();
    this.button = 0;
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.startingChips = 1500;
    this.players = [];
}

Gs.prototype.addPlayer = function(id) {
    var player = new Player(id);
    player.seat = this.players.length;
    this.players.push(player);
    player.chips = this.startingChips;
}

Gs.prototype.newHand = function() {
    this.deck.shuffle();
    this.button = this.getNextPlayer(this.button);
    this.pot = this.smallBlind + this.bigBlind;
    this.currentRound = c.ROUND_PREFLOP;
    this.boardCards = [];
    this.actionOn = this.button;
    this.availableActions = [c.ACTION_FOLD, c.ACTION_CALL, c.ACTION_RAISE];

    this.history = {};
    for (var i = 0; i < c.roundList.length; i++) {
        this.history[i] = [];
    }
    this.winner = null;

    // Post blinds.
    if (this.isButton(0)) {
        this.players[0].roundPIP = this.smallBlind;
        this.players[0].chips -= this.smallBlind;
        this.players[1].roundPIP = this.bigBlind;
        this.players[1].chips -= this.bigBlind;
    } else {
        this.players[0].roundPIP = this.bigBlind;
        this.players[0].chips -= this.bigBlind;
        this.players[1].roundPIP = this.smallBlind;
        this.players[1].chips -= this.smallBlind;
    }

    this.currentBet = this.bigBlind;
    this.toCall = this.currentBet - this.players[this.actionOn].roundPIP;
    this.minRaiseTo = this.players[this.actionOn].roundPIP + this.bigBlind;

    // Draw cards.
    for (var i = 0; i < this.players.length; i++) {
        this.players[i].hole = this.deck.draw(2);
    }
};

Gs.prototype.filter = function(seat) {
    // Hide certain values based on seat (for security reasons so they can't
    // snoop other player's hole cards or next card in deck).
    var filterKeys = ['players', 'deck'];
    var filteredGs = {}
    for (var keys = Object.keys(this), l = keys.length; l; --l) {
        if (filterKeys.indexOf(keys[l - 1]) < 0) {
            filteredGs[keys[l - 1]] = this[keys[l - 1]];
        }
    }

    var players = [];
    for (var i = 0; i < this.players.length; i++) {
        if (i == seat) {
            players.push(this.players[i]);
        } else {
            var player = {};
            var filterKeys = [];

            if (this.winner === null) {
                // Show cards on showdown.
                filterKeys.push('hole');
            }

            for (var keys = Object.keys(this.players[i]), l = keys.length; l; --l) {
                if (filterKeys.indexOf(keys[l - 1]) < 0) {
                    player[keys[l - 1]] = this.players[i][keys[l - 1]];
                }
            }
            players.push(player);
        }
    }
    filteredGs.players = players;
    return filteredGs;
};

Gs.prototype.isButton = function(seat) {
    return seat == this.button ? true : false;
}

Gs.prototype.getNextPlayer = function(seat) {
    if (!(seat >= 0)) {
        seat = this.actionOn;
    }

    // Get next player.
    if (seat == this.players.length - 1) {
        return 0;
    } else {
        return seat + 1;
    }
}

Gs.prototype.getPrevPlayer = function(seat) {
    if (!seat) { seat = this.actionOn; }

    // Get prev player.
    if (seat == 0) {
        return this.players.length - 1;
    } else {
        return seat - 1;
    }
}

Gs.prototype.nextTurn = function() {
    // Switch turn to next player (action on other player).
    this.actionOn = this.getNextPlayer(this.actionOn);
};

Gs.prototype.nextRound = function() {
    // Switch turn as well as switch round.
    switch (this.currentRound) {
        case c.ROUND_PREFLOP:
            this.currentRound = c.ROUND_FLOP;
            var flop = this.deck.draw(3);
            this.boardCards = this.boardCards.concat(flop);
            break;
        case c.ROUND_FLOP:
            this.currentRound = c.ROUND_TURN;
            this.boardCards.push(this.deck.draw());
            break;
        case c.ROUND_TURN:
            this.currentRound = c.ROUND_RIVER;
            this.boardCards.push(this.deck.draw());
            break;
    }

    // Reset minRaiseTo
    this.minRaiseTo = this.bigBlind;

    // Reset round VPIP.
    for (var i = 0; i < this.players.length; i++) {
        this.players[i].roundPIP = 0;
    }

    if (this.currentRound != c.ROUND_FLOP) {
        this.nextTurn();
    }
};

Gs.prototype.hasGameWinner = function() {
    // Check if anyone has busted.
    if (this.players[0].chips === 0) { return 1; }
    if (this.players[1].chips === 0) { return 0; }
    return false;
}

Gs.prototype.applyAction = function(action) {
    // Parses an action (.e.g {action: c.ACTION_CALL, amount: 0}).
    // Manipulates the game state and tells the
    // players. Like a finite state machine.
    var seat = this.actionOn;
    var player = this.players[seat];

    this.history[this.currentRound].push(action);
    if (this.availableActions.indexOf(action.action) < 0) {
        return {'error': true}
    }

    switch (action.action) {
        case c.ACTION_FOLD:
            // Next hand if a player folds.
            this.winner = this.getNextPlayer();
            this.players[this.winner].chips += this.pot;
            return {'hand-complete': true};
            break;

        case c.ACTION_CHECK:
            if (this.isButton(seat)) {
                if (this.currentRound == c.ROUND_RIVER) {
                    // End hand if button checks back river.
                    this.calcHandWinner();
                    return {'hand-complete': true};
                } else {
                    // Next round if button checks back round.
                    this.nextRound();
                    this.availableActions = [c.ACTION_FOLD, c.ACTION_CHECK, c.ACTION_BET];
                    return {'next-round': true};
                }
            } else {
                if (this.currentRound == c.ROUND_PREFLOP) {
                    // Next round if big blind checks.
                    this.nextRound();
                    this.availableActions = [c.ACTION_FOLD, c.ACTION_CHECK, c.ACTION_BET];
                    return {'next-round': true};
                } else {
                    // Next turn if big blind leads with check.
                    this.nextTurn();
                    this.availableActions = [c.ACTION_FOLD, c.ACTION_CHECK, c.ACTION_BET];
                    return {'next-turn': true};
                }
            }

        case c.ACTION_CALL:
            // Add the call to the pot.
            // We store each player's VPIP for the current
            // round to calculate how much to call a bet or raise.
            var toCall = this.currentBet - player.roundPIP;

            if (toCall <= player.chips) {
                player.chips -= toCall;
                player.roundPIP += toCall;
                this.pot += toCall;
            } else {
                // Call all-in.
                this.pot += player.chips;
                player.roundPIP += player.chips

                // Refund other player. TODO: side-pots
                var refund = toCall - player.chips;
                this.players[this.getNextPlayer()].chips += refund;
                this.pot -= refund;

                player.chips = 0;
                while (this.boardCards.length < 5) {
                    this.boardCards.push(this.deck.draw());
                }
                this.currentRound = c.ROUND_RIVER;
                this.calcHandWinner();
                return {'hand-complete': true}
            }

            if (this.currentRound == c.ROUND_PREFLOP && this.isButton(seat) &&
                    player.roundPIP == this.bigBlind) {
                // If button limps preflop.
                this.nextTurn();
                this.availableActions = [c.ACTION_FOLD, c.ACTION_CHECK, c.ACTION_RAISE];
                return {'next-turn': true};
            } else if (this.currentRound == c.ROUND_RIVER) {
                // End hand if player calls river bet.
                this.calcHandWinner();
                return {'hand-complete': true};
            } else {
                // Next round if player calls bet.
                this.nextRound();
                this.availableActions = [c.ACTION_FOLD, c.ACTION_CHECK, c.ACTION_BET];
                return {'next-round': true};
            }
            break;

        case c.ACTION_BET: case c.ACTION_RAISE:
            var raiseTo = action.amount;
            this.currentBet = raiseTo;

            this.minRaiseTo = 2 * this.currentBet;

            // Raise the bet to the raise amount.
            player.chips -= raiseTo - player.roundPIP;
            this.pot += raiseTo - player.roundPIP;
            player.roundPIP = raiseTo;

            this.updateToCall();

            this.nextTurn();
            this.availableActions = [c.ACTION_FOLD, c.ACTION_CALL, c.ACTION_RAISE];
            return {'next-turn': true};
            break;
    }
};

Gs.prototype.updateToCall = function() {
    var nextPlayer = this.players[this.getNextPlayer()];
    this.toCall = this.currentBet - nextPlayer.roundPIP;
    if (this.toCall < 0) {
        this.toCall = nextPlayer.chips;
    }
};

Gs.prototype.calcHandWinner = function() {
    // Calculate winner of hand and ship pot to winner.
    var player0Hand = this.getHand(this.players[0].hole);
    var player1Hand = this.getHand(this.players[1].hole);

    var winnerComp = compareHands(player0Hand, player1Hand);
    if (winnerComp > 0) {
        this.winner = 0;
        this.players[this.winner].chips += this.pot;
    } else if (winnerComp < 0) {
        this.winner = 1;
        this.players[this.winner].chips += this.pot;
    } else {
        // Split the pot. seat0 gets the odd chip.
        var splitPot = parseInt(this.pot / 2, 10);
        this.players[0].chips += splitPot;
        this.pot -= splitPot;
        this.players[1].chips += this.pot;
    }
};

Gs.prototype.getHand = function(hole) {
    // Calculates hand (hole + board cards).
    var hand = this.boardCards.concat(hole);
    hand.sort(function(a, b) { return a.rank - b.rank; });

    var returnHand = calcHand(hand);
    return returnHand;
};


function calcHand(hand) {
    // Iterates through hand, recursively removing a card until we get
    // five-card hands. Determines the strength of hand, returns it, and
    // the best hand will bubble up the stack.

    var i;
    if (hand.length == 5) {
        return getHandStrength(hand);
    }

    var bestHand;
    for (i = 0; i < hand.length; i++) {
        var slicedHand = hand.slice(0);
        slicedHand.remove(i);
        var possibleBestHand = calcHand(slicedHand);
        if (!bestHand || compareHands(possibleBestHand, bestHand) == 1) {
            bestHand = possibleBestHand;
        }
    }
    return bestHand;
}


function getHandStrength(hand) {
    var histogram = getHandHistogram(hand);

    // Calculate hand strength.
    if ('4' in histogram) {
        // Quads.
        return {strength: c.HAND_QUADS, hand: hand,
                ranks: [histogram['4'], histogram['1']]}
    } else if ('3' in histogram && '2' in histogram) {
        // Boat.
        return {strength: c.HAND_BOAT, hand: hand,
                ranks: [histogram['3'], histogram['2']]};
    } else if ('3' in histogram) {
        // Trips.
        return {strength: c.HAND_TRIPS, hand: hand,
                ranks: [histogram['3'], histogram['1']]};
    } else if ('2' in histogram && histogram['2'].length == 2) {
        // Two-pair.
        return {strength: c.HAND_TWO_PAIR, hand: hand,
                ranks: [histogram['2'], histogram['1']]};
    } else if ('2' in histogram) {
        // Pair.
        return {strength: c.HAND_PAIR, hand: hand,
                ranks: [histogram['2'], histogram['1']]};
    } else {
        var hasFlush = true;
        for (i=0; i < hand.length - 1; i++) {
            if (hand[i].suit != hand[i + 1].suit) {
                hasFlush = false;
                break;
            }
        }
        var hasStraight = (hand[4].rank - hand[0].rank == 4 ||
                           (hand[0].rank == 14 && hand[4].rank == 5));

        if (hasFlush && hasStraight) {
            return {strength: c.HAND_STR_FLUSH, hand: hand,
                    ranks: [histogram['1']]}
        } else if (hasFlush) {
            return {strength: c.HAND_FLUSH, hand: hand,
                    ranks: [histogram['1']]}
        } else if (hasStraight) {
            return {strength: c.HAND_STRAIGHT, hand: hand,
                    ranks: [histogram['1']]}
        } else {
            // High card.
            return {strength: c.HAND_HIGH, hand: hand,
                    ranks: [histogram['1']]}
        }
    }
}


function getHandHistogram(hand) {
    // Get cardinalities (e.g. {'5': 2, '13': 1})
    var cardinalities = {};
    for (i = 0; i < hand.length; i++) {
        if (hand[i].rank in cardinalities) {
            cardinalities[hand[i].rank]++;
        } else {
            cardinalities[hand[i].rank] = 1;
        }
    }

    // Get histogram of hand (e.g. {'2': [{'5': 2}, {'13': 2}], '1': [{'1': 1}]}).
    var histogram = {};
    for (rank in cardinalities) {
        var cardinality = cardinalities[rank];
        if (cardinality in histogram) {
            // Value of histogram is list of ranks that fall under the
            // cardinality, sorted in reverse to make it easier to
            // compare hands.
            histogram[cardinality].push(parseInt(rank, 10));
            histogram[cardinality].sort(function(a, b) { return b - a; });
        } else {
            histogram[cardinality] = [parseInt(rank, 10)];
        }
    }

    return histogram;
}


function compareHands(handA, handB) {
    if (handA.strength > handB.strength) {
        return 1;
    }
    if (handA.strength < handB.strength) {
        return -1;
    }
    // If it's the same hand, compare the appropriate ranks.
    // Go through the cardinalities from most-to-least dominance (e.g. 4
    // for quads, then 1 for the kicker) and compare the ranks
    // e.g. 4444A vs 3333A: check the cardinality of 4 and compare 4444 vs 3333
    // e.g. 4444A vs 4444K: check the cardinality of 4, see it's same, then check cardinality of 1, the kicker
    for (var cardinality=0; cardinality < handA.ranks.length; cardinality++) {
        for (var rank=0; rank < handA.ranks[cardinality].length; rank++) {
            if (handA.ranks[cardinality][rank] > handB.ranks[cardinality][rank]) {
                return 1;
            }
            if (handA.ranks[cardinality][rank] < handB.ranks[cardinality][rank]) {
                return -1;
            }
        }
    }
    return 0;
}


function prettyHand(hand) {
    var pretty = '';
    for (var i=0; i < hand.hand.length; i++) {
        pretty += hand.hand[i].card + ' ';
    }
    return pretty;
}


Array.prototype.remove = function(from, to) {
    // Array Remove - By John Resig (MIT Licensed)
   var rest = this.slice((to || from) + 1 || this.length);
   this.length = from < 0 ? this.length + from : from;
   return this.push.apply(this, rest);
};


exports.Deck = Deck;
exports.Gs = Gs;
exports.Holdem = {
    calcHand: calcHand,
    getHandStrength: getHandStrength,
    compareHands: compareHands,
}
