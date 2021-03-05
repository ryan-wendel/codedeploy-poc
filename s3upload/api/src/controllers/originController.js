// Get Models
const Origin = require('../models/origin.js');

exports.getOrigin = async (id) => {
    // could use to sanitize id
    try {
        const origin = await Origin.findById(id);
        return origin;
    } catch (error) {
        console.log(error);
    }
}

exports.getOrigins = async () => {
    try {
        const origins = await Origin.find().sort({origin: 1});
        return origins;
    } catch (error) {
        console.log(error);
    }
}