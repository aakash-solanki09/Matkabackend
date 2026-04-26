const mongoose = require('mongoose');

const betSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User',
    },
    roundId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Round',
    },
    number: {
        type: Number,
        required: true,
        min: 0,
        max: 9,
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
    },
    isWinner: {
        type: Boolean,
        default: false,
    },
    payout: {
        type: Number,
        default: 0,
    }
}, {
    timestamps: true,
});

const Bet = mongoose.model('Bet', betSchema);

module.exports = Bet;
