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

        // Logic: The winning payout MUST NEVER exceed the total bets in the round.
        // This ensures the house never loses money.
        const safeNumbers = [];
        for (let i = 0; i <= 9; i++) {
            if (payouts[i] <= totalBet) {
                safeNumbers.push(i);
            }
        }

        const isSafeRound = currentRound.roundNumber % 10 === 0;
        let winningNumber = 0;

        if (isSafeRound) {
            // Safe Round (Every 10th): Maximize house profit
            let maxProfit = -Infinity;
            safeNumbers.forEach(num => {
                const profit = totalBet - payouts[num];
                if (profit > maxProfit) {
                    maxProfit = profit;
                    winningNumber = num;
                }
            });
        } else {
            // Normal Round: Stay in profit, but allow users to win if it's safe.
            // Pick from safe numbers that actually have bets on them.
            const winnersWithBets = safeNumbers.filter(num => numberBets[num] > 0);
            
            if (winnersWithBets.length > 0) {
                // Randomly pick a winner from those who bet safely
                winningNumber = winnersWithBets[Math.floor(Math.random() * winnersWithBets.length)];
            } else {
                // If no safe number has bets, pick any safe number (likely 0 bets)
                winningNumber = safeNumbers[Math.floor(Math.random() * safeNumbers.length)];
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

        console.log(`Round ${currentRound.roundNumber} result calculated: ${winningNumber} (Profit: ${totalBet - payouts[winningNumber]})`);
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
