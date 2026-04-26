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
        const now = new Date();
        const dateStr = now.getFullYear().toString() + 
                        (now.getMonth() + 1).toString().padStart(2, '0') + 
                        now.getDate().toString().padStart(2, '0');
        
        // Check if an 'open' round already exists (recovery from crash)
        const existingOpen = await Round.findOne({ status: 'open' }).sort({ createdAt: -1 });
        if (existingOpen) {
            currentRound = existingOpen;
            console.log(`Recovered open round ${currentRound.roundNumber}`);
            startTimer();
            return;
        }

        // Find the absolute last round number for today
        const lastRound = await Round.findOne({ 
            roundNumber: { $gte: parseInt(dateStr + '0000') } 
        }).sort({ roundNumber: -1 });

        let nextRoundNumber = lastRound ? lastRound.roundNumber + 1 : parseInt(dateStr + '0001');

        currentRound = await Round.create({
            roundNumber: nextRoundNumber,
            endTime: new Date(Date.now() + 30000),
            status: 'open'
        });

        console.log(`Starting Round ${currentRound.roundNumber}`);
        
        io.emit('newRound', {
            roundId: currentRound._id,
            roundNumber: currentRound.roundNumber,
            endTime: currentRound.endTime,
        });

        startTimer();
    } catch (error) {
        if (error.code === 11000) {
            console.log('Duplicate round detected, retrying...');
            return setTimeout(startNewRound, 1000);
        }
        console.error('Error starting new round:', error);
    }
};

const startTimer = () => {
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
};

const calculateResult = async () => {
    try {
        // Find a winning number (0-9) that results in MINIMUM payout (Admin profit algo)
        const bets = await Bet.find({ roundId: currentRound._id });
        
        let minPayout = Infinity;
        let bestNumber = 0;

        // Simulate each possible winning number (0-9)
        for (let num = 0; num <= 9; num++) {
            let totalPayoutForNum = 0;
            
            const props = (n) => {
                const size = n >= 5 ? 'big' : 'small';
                let color = 'red';
                if (n === 0 || n === 5) color = 'violet';
                else if ([1, 3, 7, 9].includes(n)) color = 'green';
                return { size, color };
            };

            const p = props(num);

            bets.forEach(bet => {
                let payout = 0;
                if (bet.type === 'number' && parseInt(bet.selection) === num) {
                    payout = bet.amount * 10;
                } else if (bet.type === 'size' && bet.selection === p.size) {
                    payout = bet.amount * 2;
                } else if (bet.type === 'color') {
                    if (bet.selection === p.color) {
                        // Regular color win
                        payout = bet.amount * 2;
                        // If it's a 0 or 5 (violet mix), color only gets 1.5x
                        if (num === 0 || num === 5) payout = bet.amount * 1.5;
                    } else if (bet.selection === 'violet' && (num === 0 || num === 5)) {
                        payout = bet.amount * 4.5;
                    }
                }
                totalPayoutForNum += payout;
            });

            if (totalPayoutForNum < minPayout) {
                minPayout = totalPayoutForNum;
                bestNumber = num;
            }
        }

        currentRound.winningNumber = bestNumber;
        currentRound.totalBetAmount = bets.reduce((sum, b) => sum + b.amount, 0);
        currentRound.totalPayout = minPayout;
        currentRound.status = 'closed';
        await currentRound.save();

        // Update all bets in DB
        const props = (n) => {
            const size = n >= 5 ? 'big' : 'small';
            let color = 'red';
            if (n === 0 || n === 5) color = 'violet';
            else if ([1, 3, 7, 9].includes(n)) color = 'green';
            return { size, color };
        };
        const winP = props(bestNumber);

        for (const bet of bets) {
            let won = false;
            let payout = 0;

            if (bet.type === 'number' && parseInt(bet.selection) === bestNumber) {
                won = true;
                payout = bet.amount * 10;
            } else if (bet.type === 'size' && bet.selection === winP.size) {
                won = true;
                payout = bet.amount * 2;
            } else if (bet.type === 'color') {
                if (bet.selection === winP.color) {
                    won = true;
                    payout = bet.amount * 2;
                    if (bestNumber === 0 || bestNumber === 5) payout = bet.amount * 1.5;
                } else if (bet.selection === 'violet' && (bestNumber === 0 || bestNumber === 5)) {
                    won = true;
                    payout = bet.amount * 4.5;
                }
            }

            bet.isWinner = won;
            bet.payout = payout;
            await bet.save();

            if (won) {
                const user = await User.findById(bet.user);
                user.walletBalance += payout;
                await user.save();
            }
        }

        console.log(`Round ${currentRound.roundNumber} Result: ${bestNumber} (${winP.size}, ${winP.color}) - Pool: ${currentRound.totalBetAmount}, Payout: ${currentRound.totalPayout}`);
    } catch (error) {
        console.error('Error calculating result:', error);
    }
};

const endRound = async () => {
    try {
        const winningProps = (num) => {
            const size = num >= 5 ? 'BIG' : 'SMALL';
            let color = 'red';
            if (num === 0 || num === 5) color = 'violet'; 
            else if ([1, 3, 7, 9].includes(num)) color = 'green';
            return { size, color };
        };

        const props = winningProps(currentRound.winningNumber);

        io.emit('roundResult', {
            roundId: currentRound._id,
            winningNumber: currentRound.winningNumber,
            size: props.size,
            color: props.color,
            totalBet: currentRound.totalBetAmount,
            totalPayout: currentRound.totalPayout,
        });

        setTimeout(startNewRound, 5000);
    } catch (error) {
        console.error('Error ending round:', error);
    }
};

const getCurrentRound = () => currentRound;

module.exports = { initGameEngine, getCurrentRound };
