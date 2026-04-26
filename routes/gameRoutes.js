const express = require('express');
const router = express.Router();
const { placeBet, getRecentRounds, getMyBets } = require('../controllers/gameController');
const { protect } = require('../middleware/authMiddleware');

router.post('/bet', protect, placeBet);
router.get('/history', getRecentRounds);
router.get('/my-bets', protect, getMyBets);

module.exports = router;
