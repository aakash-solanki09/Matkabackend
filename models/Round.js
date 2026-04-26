const mongoose = require('mongoose');

const roundSchema = mongoose.Schema({
    roundNumber: {
        type: Number,
        required: true,
        unique: true,
    },
    startTime: {
        type: Date,
        default: Date.now,
    },
    endTime: {
        type: Date,
        required: true,
    },
    winningNumber: {
        type: Number,
        default: null,
    },
    totalBetAmount: {
        type: Number,
        default: 0,
    },
    totalPayout: {
        type: Number,
        default: 0,
    },
    status: {
        type: String,
        enum: ['open', 'closed'],
        default: 'open',
    }
}, {
    timestamps: true,
});

const Round = mongoose.model('Round', roundSchema);

module.exports = Round;
