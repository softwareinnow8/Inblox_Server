// const mongoose = require("mongoose");
// const bcrypt = require("bcryptjs");

// const userSchema = new mongoose.Schema(
//     {
//         username: {
//             type: String,
//             required: true,
//             unique: true,
//             trim: true,
//             minlength: 3,
//             maxlength: 20,
//         },
//         email: {
//             type: String,
//             required: true,
//             unique: true,
//             trim: true,
//             lowercase: true,
//             match: [
//                 /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
//                 "Please enter a valid email",
//             ],
//         },
//         password: {
//             type: String,
//             minlength: 6,
//             default: null, // Optional for OAuth users
//         },
//         firstName: {
//             type: String,
//             trim: true,
//             maxlength: 50,
//         },
//         lastName: {
//             type: String,
//             trim: true,
//             maxlength: 50,
//         },
//         avatar: {
//             type: String,
//             default: null,
//         },
//         // Google OAuth fields
//         googleId: {
//             type: String,
//             unique: true,
//             sparse: true,
//         },
//         googleEmail: {
//             type: String,
//             trim: true,
//             lowercase: true,
//         },
//         authProvider: {
//             type: String,
//             enum: ['local', 'google'],
//             default: 'local',
//         },
//         isVerified: {
//             type: Boolean,
//             default: true, // For now, set to true. Can implement email verification later
//         },
//         lastLogin: {
//             type: Date,
//             default: Date.now,
//         },
//     },
//     {
//         timestamps: true,
//     }
// );

// // Hash password before saving
// userSchema.pre("save", async function (next) {
//     if (!this.isModified("password") || !this.password) return next();

//     try {
//         const salt = await bcrypt.genSalt(12);
//         this.password = await bcrypt.hash(this.password, salt);
//         next();
//     } catch (error) {
//         next(error);
//     }
// });

// // Compare password method
// userSchema.methods.comparePassword = async function (candidatePassword) {
//     return bcrypt.compare(candidatePassword, this.password);
// };

// // Remove password from JSON output
// userSchema.methods.toJSON = function () {
//     const userObject = this.toObject();
//     delete userObject.password;
//     return userObject;
// };

// module.exports = mongoose.model("User", userSchema);


// import mongoose from "mongoose";
import mongoose from "mongoose";
// import bcrypt from "bcryptjs";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
            maxlength: 20,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                "Please enter a valid email",
            ],
        },
        password: {
            type: String,
            // Password validation is done in the route with validatePassword()
            default: null, // Optional for OAuth users
        },
        firstName: {
            type: String,
            trim: true,
            maxlength: 50,
        },
        lastName: {
            type: String,
            trim: true,
            maxlength: 50,
        },
        avatar: {
            type: String,
            default: null,
        },
        // Changed: Use single field 'profilePicture' for consistency
        profilePicture: {
            type: String,
            default: null,
        },
        // Google OAuth fields
        googleId: {
            type: String,
            unique: true,
            sparse: true,
        },
        // Removed: googleEmail is redundant since we already have 'email'
        // Google users will use the same 'email' field
        authProvider: {
            type: String,
            enum: ['local', 'google', 'both'], // Added 'both' for users who link accounts
            default: 'local',
        },
        isVerified: {
            type: Boolean,
            default: false, // Changed: false for local users, will be true for Google users
        },
        isEmailVerified: {
            type: Boolean,
            default: false, // Alias for isVerified, more explicit naming
        },
        emailVerificationToken: {
            type: String,
            default: null,
        },
        emailVerificationExpires: {
            type: Date,
            default: null,
        },
        passwordResetToken: {
            type: String,
            default: null,
        },
        passwordResetExpires: {
            type: Date,
            default: null,
        },
        lastLogin: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
    if (!this.isModified("password") || !this.password) return next();

    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    // Return false if user doesn't have a password (Google-only users)
    if (!this.password) {
        return false;
    }
    return bcrypt.compare(candidatePassword, this.password);
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    if (this.firstName && this.lastName) {
        return `${this.firstName} ${this.lastName}`;
    }
    return this.username;
});

// Remove password from JSON output and include virtuals
userSchema.set('toJSON', {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
    }
});

userSchema.set('toObject', {
    virtuals: true
});

export default mongoose.model("User", userSchema);