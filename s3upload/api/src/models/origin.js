// External Dependancies
const mongoose = require('mongoose');

const originsSchema = new mongoose.Schema({
    origin: String,
}, { collection: 'origins', versionKey: false });
    
module.exports = mongoose.model('Origin', originsSchema);