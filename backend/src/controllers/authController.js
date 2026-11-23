
const pool = require("../config/database");
const bcrypt = require("bcryptjs");

// User Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // Find user by email
    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, role, specialization, is_active
       FROM users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = result.rows[0];

    // Check account status
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive.",
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Unable to create session.",
        });
      }

      req.session.user = {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        specialization: user.specialization,
      };

      req.session.save((saveError) => {
        if (saveError) {
          return res.status(500).json({
            success: false,
            message: "Unable to save session.",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Login successful.",
          user: req.session.user,
        });
      });
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

// Get logged-in user
const getMe = (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.session.user,
  });
};

// Logout
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Logout failed.",
      });
    }

    res.clearCookie("inquiry.sid");

    return res.status(200).json({
      success: true,
      message: "Logout successful.",
    });
  });
};

module.exports = {
  login,
  getMe,
  logout,
};
