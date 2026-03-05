import {authenticateAdmin} from './authAdmin.js';

const requireAdmin = (options = {}) => {
    const {allowedRoles = ['admin', 'super-admin', 'editor']} = options;

    return async (req, res, next) => {
        authenticateAdmin(req, res, async () => {
            const role = req.admin?.role;
            if (!allowedRoles.includes(role)) {
                return res.status(403).json({error: 'Access denied. Insufficient role.'});
            }
            next();
        });
    };
};

export default requireAdmin;
