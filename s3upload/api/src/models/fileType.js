// External Dependancies
const mongoose = require('mongoose')

const fileTypesSchema = new mongoose.Schema({
    type: String,
    text: String,
    help: String,
    bucket: String,
    path: String,
    extensions: Array,
    mimetypes: Array
}, { collection: 'fileTypes', versionKey: false })

module.exports = mongoose.model('FileType', fileTypesSchema)