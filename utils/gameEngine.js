const Round = require('../models/Round');
const Bet = require('../models/Bet');
const User = require('../models/User');

let currentRound = null;
let io = null;

const initGameEngine = (socketIo) => {
    io = socketIo;
    startNewRound();
};

const startNewRound = async () => {
    try {
        const lastRound = await Round.findOne().sort({ roundNumber: -1 });
        const roundNumber = lastRound ? lastRound.roundNumber + 1 : 1;

        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 30000); // 30 seconds

        currentRound = await Round.create({
            roundNumber,
            startTime,
            endTime,
            status: 'open',
        });

        console.log(`Starting Round ${roundNumber}`);
        io.emit('newRound', {
            roundId: currentRound._id,
            roundNumber: currentRound.roundNumber,
            startTime: currentRound.startTime,
            endTime: currentRound.endTime,
        });

        // Run countdown
        let timeLeft = 30;
        const timer = setInterval(() => {
            timeLeft--;
            io.emit('timer', timeLeft);

            if (timeLeft === 5) {
                calculateResult();
            }

            if (timeLeft <= 0) {
                clearInterval(timer);
                endRound();
            }
        }, 1000);
    } catch (error) {
        console.error('Error starting new round:', error);
    }
};

const calculateResult = async () => {
    try {
        currentRound.status = 'closed';
        await currentRound.save();

        const bets = await Bet.find({ roundId: currentRound._id });
        const totalBet = bets.reduce((sum, bet) => sum + bet.amount, 0);

        // Group bets by number
        const numberBets = {};
        for (let i = 0; i <= 9; i++) {
            numberBets[i] = 0;
        }
        bets.forEach(bet => {
            numberBets[bet.number] += bet.amount;
        });

        // Calculate potential payouts for each number
        const payouts = {};
        for (let i = 0; i <= 9; i++) {
            payouts[i] = numberBets[i] * 2;
        }

        // Logic: Every 10th round is a "Safe Round" (House MUST profit)
        const isSafeRound = currentRound.roundNumber % 10 === 0;
        let winningNumber = 0;

        if (isSafeRound) {
            // Find numbers where payout <= totalBet (Safe for house)
            const safeNumbers = [];
            for (let i = 0; i <= 9; i++) {
                if (payouts[i] <= totalBet) {
                    safeNumbers.push(i);
                }
            }

            if (safeNumbers.length > 0) {
                // Pick the one with max profit among safe ones
                let maxProfit = -Infinity;
                safeNumbers.forEach(num => {
                    const profit = totalBet - payouts[num];
                    if (profit > maxProfit) {
                        maxProfit = profit;
                        winningNumber = num;
                    }
                });
            } else {
                // If no safe number, pick the one with MINIMUM payout to minimize loss
                let minPayout = Infinity;
                for (let i = 0; i <= 9; i++) {
                    if (payouts[i] < minPayout) {
                        minPayout = payouts[i];
                        winningNumber = i;
                    }
                }
            }
        } else {
            // Normal Round: Pick a number that is "fairer" or less likely to be 0
            // We'll pick a number where payout < totalBet * 1.2 (allowing some house loss but not much)
            // or just pick a number that has SOME bets but not the most.
            const potentialWinners = [];
            for (let i = 0; i <= 9; i++) {
                // Prefer numbers that have bets but wouldn't break the bank
                if (payouts[i] > 0 && payouts[i] < totalBet * 1.5) {
                    potentialWinners.push(i);
                }
            }

            if (potentialWinners.length > 0) {
                winningNumber = potentialWinners[Math.floor(Math.random() * potentialWinners.length)];
            } else {
                // Randomly pick between 0-9 but avoid 0 if possible unless it's random
                winningNumber = Math.floor(Math.random() * 10);
            }
        }

        // Update round with results
        currentRound.winningNumber = winningNumber;
        currentRound.totalBetAmount = totalBet;
        currentRound.totalPayout = payouts[winningNumber];
        await currentRound.save();

        // Process winners
        const winningBets = bets.filter(bet => bet.number === winningNumber);
        for (const bet of winningBets) {
            bet.isWinner = true;
            bet.payout = bet.amount * 2;
            await bet.save();

            const user = await User.findById(bet.user);
            user.walletBalance += bet.payout;
            await user.save();
        }

        console.log(`Round ${currentRound.roundNumber} result calculated: ${winningNumber}`);
    } catch (error) {
        console.error('Error calculating result:', error);
    }
};

const endRound = async () => {
    try {
        // Broadcast the pre-calculated result
        io.emit('roundResult', {
            winningNumber: currentRound.winningNumber,
            totalBet: currentRound.totalBetAmount,
            totalPayout: currentRound.totalPayout,
        });

        console.log(`Round ${currentRound.roundNumber} ended. Winner: ${currentRound.winningNumber}`);

        // Wait 5 seconds before starting next round
        setTimeout(startNewRound, 5000);
    } catch (error) {
        console.error('Error ending round:', error);
    }
};

const getCurrentRound = () => currentRound;

module.exports = { initGameEngine, getCurrentRound };
