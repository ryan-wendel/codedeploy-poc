// External Dependancies
const mongoose = require('mongoose')

const filesSchema = new mongoose.Schema({
    type: String,
    name: String,
    description: String,
}, { collection: 'files', versionKey: false })
    
module.exports = mongoose.model('File', filesSchema)