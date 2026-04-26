const Bet = require('../models/Bet');
const User = require('../models/User');
const { getCurrentRound } = require('../utils/gameEngine');

const placeBet = async (req, res) => {
    try {
        const { type, selection, amount } = req.body;
        const currentRound = getCurrentRound();

        if (!currentRound || currentRound.status !== 'open') {
            return res.status(400).json({ message: 'No active round for betting' });
        }

        // Validation
        if (!['number', 'color', 'size'].includes(type)) {
            return res.status(400).json({ message: 'Invalid bet type' });
        }

        if (type === 'number' && (parseInt(selection) < 0 || parseInt(selection) > 9)) {
            return res.status(400).json({ message: 'Invalid number selection' });
        }
        if (type === 'color' && !['red', 'green', 'violet'].includes(selection)) {
            return res.status(400).json({ message: 'Invalid color selection' });
        }
        if (type === 'size' && !['big', 'small'].includes(selection)) {
            return res.status(400).json({ message: 'Invalid size selection' });
        }

        const user = await User.findById(req.user._id);
        if (user.walletBalance < amount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        // Deduct coins
        user.walletBalance -= amount;
        await user.save();

        const bet = await Bet.create({
            user: req.user._id,
            roundId: currentRound._id,
            type,
            selection,
            amount,
        });

        res.status(201).json({
            message: 'Bet placed successfully',
            bet,
            newBalance: user.walletBalance,
        });
    } catch (error) {
        console.error('Error in placeBet:', error);
        res.status(500).json({ message: 'Server error placing bet', error: error.message });
    }
};

const getRecentRounds = async (req, res) => {
    const rounds = await require('../models/Round').find({ status: 'closed' }).sort({ createdAt: -1 }).limit(1000);
    res.json(rounds);
};

const getMyBets = async (req, res) => {
    const bets = await Bet.find({ user: req.user._id }).populate('roundId').sort({ createdAt: -1 }).limit(1000);
    res.json(bets);
};

module.exports = { placeBet, getRecentRounds, getMyBets };
