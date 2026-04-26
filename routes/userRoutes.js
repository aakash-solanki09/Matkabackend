const express = require('express');
const router = express.Router();
const { registerUser, authUser, getUserProfile, addCoins } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', authUser);
router.get('/profile', protect, getUserProfile);
router.post('/add-coins', protect, addCoins);

module.exports = router;
