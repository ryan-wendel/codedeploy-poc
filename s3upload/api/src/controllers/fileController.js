// Get file model
const File = require('../models/file.js');

exports.getFile = async (id) => {
    // could use to sanitize id
    try {
        const file = await File.findById(id).lean();
        return file;
    } catch (error) {
        console.log(error);
    }
}

exports.getFiles = async () => {
    try {
        const files = await File.find().lean().sort({name: 1});
        return files;
    } catch (error) {
        console.log(error);
    }
}

exports.newFile = async (json) => {
    // probably need some sanitizing to
    // take place right about here
    try {
        const file = new File(json);
        return file.save();
    } catch (error) {
        console.log(error);
    }
}

exports.updateFile = async (id, json) => {
    // probably need some sanitizing to
    // take place right about here
    try {
        //const file = json;
        const { ...updateData } = json;
        const update = await File.findByIdAndUpdate(id, updateData, { new: true, useFindAndModify: false});
        return update;
    } catch (error) {
        console.log(error);
    }
}

exports.deleteFile = async (id) => {
    // could use to sanitize id
    try {
        const file = await File.findByIdAndRemove(id, { useFindAndModify: false });
        return file;
    } catch (error) {
        console.log(error);
    }
}