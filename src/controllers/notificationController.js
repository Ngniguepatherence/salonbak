const Notification = require('../models/Notification');

// @desc    Get all notifications for logged in user
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res, next) => {
  try {
    if (!req.user.salon) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const salonId = req.user.salon._id || req.user.salon;

    const notifications = await Notification.find({
      salon: salonId,
      user: req.user._id
    }).sort({ timestamp: -1 }).limit(50);

    res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark a notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification introuvable' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res, next) => {
  try {
    if (!req.user.salon) {
      return res.status(200).json({ success: true });
    }

    const salonId = req.user.salon._id || req.user.salon;

    await Notification.updateMany(
      { salon: salonId, user: req.user._id, read: false },
      { read: true }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};
