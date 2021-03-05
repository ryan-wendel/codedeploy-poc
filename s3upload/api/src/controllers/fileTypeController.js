// Get fileType model
const FileType = require('../models/fileType.js');

exports.getFileType = async (id) => {
    // could use to sanitize id
    try {
        const fileType = await FileType.findById(id).lean();
        return fileType;
    } catch (error) {
        console.log(error);
    }
}

exports.getFileTypes = async () => {
    try {
        const fileTypes = await FileType.find().lean().sort({type: 1});
        return fileTypes;
    } catch (error) {
        console.log(error)
    }
}

exports.newFileType = async (json) => {
    // probably need some sanitizing to
    // take place right about here
    try {
        const fileType = new FileType(json)
        return fileType.save()
    } catch (error) {
        console.log(error)
    }
}

exports.updateFileType = async (id, json) => {
    // probably need some sanitizing to
    // take place right about here
    try {
        const fileType = json
        const { ...updateData } = fileType
        const update = await FileType.findByIdAndUpdate(id, updateData, { new: true, useFindAndModify: false})
        return update
    } catch (error) {
        console.log(error)
    }
}

exports.deleteFileType = async (id) => {
    // could use to sanitize id
    try {
        const fileType = await FileType.findByIdAndRemove(id)
        return fileType
    } catch (error) {
        console.log(error)
    }
}