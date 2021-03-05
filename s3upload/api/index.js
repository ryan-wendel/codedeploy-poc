// index.js

// needed to read temp file
const fs = require('fs');

// keep a util handy to dump objects
const util = require('util');
//console.log(util.inspect(error, {depth: null}))

// grab our env variables
const dotenv = require('dotenv');
dotenv.config();

// Import the fastify framework stuffs
const fastify = require('fastify');

// only load what we need from the AWS SDK S3 client
// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html
const { S3Client,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand
} = require('@aws-sdk/client-s3')

// only load the getSignedUrl method 
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Require external modules
const mongoose = require('mongoose');

//---------------------------------------------------------
// Pull in our environment variables
//---------------------------------------------------------
dotenv.config();

//---------------------------------------------------------
// Create and configure our fastify object
//---------------------------------------------------------
const app = fastify()

// using fastify multipart for upload
// https://github.com/fastify/fastify-multipart
app.register(require('fastify-multipart'), {
    limits: {
      fileSize: 1 * 1024 * 1024,       // For multipart forms, the max file size
      files: 1                         // Max number of file fields
    }
  });

//---------------------------------------------------------
// Create an S3 client object
//---------------------------------------------------------
const s3 = new S3Client();

//---------------------------------------------------------
// Setup MongoDB stuffs
//---------------------------------------------------------
const mongoHost = process.env.MONGO_HOST;
const mongoPort = process.env.MONGO_PORT;
const mongoDatabase = process.env.MONGO_DATABASE;
const mongoUsername = process.env.MONGO_USERNAME;
const mongoPassword = process.env.MONGO_PASSWORD;

// Connect to DB
mongoose.connect('mongodb://' + mongoUsername + ':' + mongoPassword + '@' + mongoHost + ':' +mongoPort + '/' + mongoDatabase, {useNewUrlParser: true, useUnifiedTopology: true})
    .then(() => console.log('MongoDB connected...'))
    .catch(error => console.log(error));

//---------------------------------------------------------
// Include our controllers
//---------------------------------------------------------
const fileController = require('./src/controllers/fileController.js');
const fileTypeController = require('./src/controllers/fileTypeController.js');
const originController = require('./src/controllers/originController.js');

//---------------------------------------------------------
// Helper functions
//---------------------------------------------------------
function buildAllowedFileTypes(fileTypes) {
    var allowedTypes = [];

    for(let i = 0; i < fileTypes.length; i++) {
        allowedTypes.push(fileTypes[i].type);
    }
    return allowedTypes;
}

function getTypeInfo(type, fileTypes) {
    for(let i = 0; i < fileTypes.length; i++) {
        if(type == fileTypes[i].type) {
            return fileTypes[i];
        }
    }
}

function renameKey( object, oldKey, newKey ) {
    object[newKey] = object[oldKey];
    delete object[oldKey];
  }

//---------------------------------------------------------

// Apex route
app.get('/', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.code(200).send('{ "message":"Hello world" }');
    return;
})

// health check route
app.get('/health', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8');

    if (mongoose.connection.readyState === 1) {
        reply.code(200).send('{ "data": "Database connection is healthy" }');
        return;
    } else {
        reply.code(503).send('{ "data": "Database connection is not healthy" }');
        return;
    }
})

// get a single file's info from the db
// requires an id
app.get('/getFile', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8');

    // sanity checking
    if(!request.query.id) {
        reply.code(400).send('{ "message":"Please provide file id" }');
        return;  
    }

    try {
        const file = await fileController.getFile(request.query.id);

        if(!file) {
            reply.code(404).send('{ "message":"File does not exist" }');
            return;
        }
        reply.code(200).send('{ "data": ' + JSON.stringify(file) + '  }')
        return;
    } catch (error) {
        console.log("Error", error);
        reply.code(500).send('{ "message":"Problem accessing file" }');
        return;
    }
})

// get all the file info from the database
app.get('/getFiles', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8')

    try {
        const files = await fileController.getFiles();
        reply.code(200).send('{ "data": ' + JSON.stringify(files) + '  }')
        //console.log(files);
        return;
    } catch (error) {
        console.log("Error", error);
        reply.code(500).send('{ "message":"Cannot access files" }');
        return;
    } 
})

// create a new file document/row in the database
app.post('/newFile', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8')

    // sanity checking
    if(!request.body.type) {
        reply.code(400).send('{ "message":"Please provide file type" }');
        return;  
    } else if(!request.body.name) {
        reply.code(400).send('{ "message":"Please provide file name" }');
        return; 
    } else if(!request.body.description) {
        reply.code(400).send('{ "message":"Please provide file description" }');
        return; 
    }

    try {
        const file = await fileController.newFile(request.body);
        reply.code(201).send('{ "message":"Successfully created file" }');
        return;
    } catch (error) {
        console.log("Error", error);
        reply.code(500).send('{ "message":"Could not create file" }')
        return
    } 
})

// delete a file document/row in the database
// requires an id
app.delete("/deleteFile", async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8');

    // do we have json and a request body?
    if(request.body && request.headers['content-type'] && request.headers['content-type'].toLowerCase().includes('json')) {
        var fileId = request.body.id;
    } else { // do we have query params?
        var fileId = request.query.id;
    }
    
    // nope tf out
    if(!fileId) {
        reply.code(400).send('{ "message":"Please provide a file ID" }');
    }

    try {
        const file = await fileController.getFile(fileId);

        if(!file) {
            reply.code(404).send('{ "message":"File does not exist" }');
            return;
        }

        // need these for later
        const fileType = file.type;
        const fileName = file.name;

        // grab the file type info
        const fileTypes = await fileTypeController.getFileTypes();

        // grab our type info
        const typeInfo = getTypeInfo(fileType, fileTypes);

        // Set the parameters
        const params = {
            "Bucket": typeInfo.bucket,
            "Key": typeInfo.path + "/" + fileName
        }

        // check if the S3 object even exists
        try { 
            const headCheck = await s3.send(new HeadObjectCommand(params))
        } catch (error) {
            //if(error.message == 'NotFound') {
            if(error.$metadata.httpStatusCode == 404) {
                console.log("Error", error);
                reply.code(404).send('{ "message":"Object does not exist in S3" }');
            } else {
                console.log("Error", error);
                reply.code(500).send('{ "message":"Problem determining object status" }');
            }
            return;
        }

        // delete the object from S3
        try {
            const data = await s3.send(new DeleteObjectCommand(params))
            console.log("Success", data);
        } catch (error) {
            console.log("Error", error);
            reply.code(500).send('{ "message":"File delete failed" }');
            return;
        }

        // delete the file from the database
        try {
            const deleted = fileController.deleteFile(fileId);
            console.log("Delete success", deleted);
            reply.code(200).send('{ "message":"File deletion successful" }');
            return;
        } catch (error) {
            console.log("Error", error);
            reply.code(500).send('{ "message":"File removed from S3 but database deletion failed" }');
            return;
        }
    } catch (error) {
        console.log("Error", error);
        reply.code(400).send('{ "message":"Problem accessing file" }');
        return;
    }
})

// update a file document/row in the database
// requires an id and description
app.put('/updateFile', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8');

    // grab the file parameters
    const fileId = request.body.id;
    const fileDescription = request.body.description;

    // some initial sanity checking
    if(!fileId) {
        reply.code(400).send('{ "message":"Need file Id" }');
        return;
    } else if(!fileDescription) {
        reply.code(400).send('{ "message":"Need file description" }');
        return;
    } 

    // do we have a row to update?
    try {
        const file = await fileController.getFile(fileId);

        if(!file) {
            reply.code(404).send('{ "message":"File does not exist" }');
            return;
        }
    } catch (error) {
        console.log("Error", error);
        reply.code(400).send('{ "message":"Problem accessing file" }');
        return;
    }

    // update the row
    try {
        // rebuild the object with correct id key
        //const newFile = JSON.parse('{ "_id":"' + fileId + '", "description":"' + fileDescription + '" }');

        // rename the id key to _id
        renameKey(request.body, "id", "_id");

        const updated = await fileController.updateFile(fileId, request.body);
        console.log(updated);
        reply.code(200).send('{ "message":"File update successful" }');
        return;
    } catch(error) {
        console.log("Error", error);
        reply.code(500).send('{ "message":"Problem updating file" }');
        return;
    }
})

// upload a file to S3 and insert a document/row into the database
// requires a file, type, and desscription
app.post("/uploadFile", async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8')

    // you can use this decorator instead of checking headers
    if (!request.isMultipart()) { 
        //reply.code(400).send(new Error('Error: Request is not multipart'))
        reply.code(400).send('{ "message":"Not a multipart form upload." }')
        return
    }

    // process a single file
    try {
        // temporarily save the file to the tmp directory
        const files = await request.saveRequestFiles();

        // save some vars to make thing easier
        const fileType          = files[0].fields.fileType.value;
        const fileDescription   = files[0].fields.description.value;
        const filePath          = files[0].filepath;
        const fileName          = files[0].filename;
        const fileMimeType      = files[0].mimetype;
        const fileExtension     = fileName.split('.').pop();

        // initial sanity checking
        if(!files[0]) {
            reply.code(400).send('{ "message":"Missing file" }');
            return;
        }else if(!fileType) {
            reply.code(400).send('{ "message":"Please provide a file type" }');
            return;
        } else if(!fileName) {
            reply.code(400).send('{ "message":"Please provide a file name" }');
            return;
        } else if(!fileDescription) {
            reply.code(400).send('{ "message":"Please provide a file description" }');
            return;
        }

        // grab the file type info
        const fileTypes = await fileTypeController.getFileTypes();
        
        // grab our allowed types array
        const allowedTypes = buildAllowedFileTypes(fileTypes);

        // grab our type info
        const typeInfo = getTypeInfo(fileType, fileTypes);

        // do we have a legit file type?
        if(!allowedTypes.includes(fileType)) {
            reply.code(400).send('{ "message":"Incorrect file type" }');
            return;
        }

        // check if file extension is legit
        if(!typeInfo.extensions.includes(fileExtension)) {
            reply.code(400).send('{ "message":"File extension does not match the chosen file type" }');
            return;
        } 

        // check if mimetype is legit
        if(!typeInfo.mimetypes.includes(fileMimeType)) {
            reply.code(400).send('{ "message":"Incorrect file format" }');
            return;
        }

        // Set the parameters
        const headParams = {
            "Bucket": typeInfo.bucket,
            "Key": typeInfo.path + "/" + fileName
        };
        
        // check if the S3 object already exists
        try {
            const headCheck = await s3.send(new HeadObjectCommand(headParams));
            console.log('File already exists in S3');
            reply.code(403).send('{ "message":"This file already exists in S3" }');
            return;
        } catch (error) {
            console.log('Head check passed. Proceeding with upload.');
        }

        // read in the file's contents
        const fileBody = fs.createReadStream(filePath)

        fileBody.on("error", function (error) {
            console.log("File Error", error);
            reply.code(500).send('{ "message":"Problem with uploaded file" }');
            return;
        });

        // Set the parameters
        const uploadParams = {
            "Bucket": typeInfo.bucket,
            "Key": typeInfo.path + "/" + fileName,
            "ContentType": fileMimeType,
            "Body": ""
        };

        // no idea why we couldn't set this in the previous declaration ¯\_(ツ)_/¯
        uploadParams.Body = fileBody;

        // upload the file to S3
        try {
            // call S3 to upload book to specified bucket
            const data = await s3.send(new PutObjectCommand(uploadParams));
            console.log("Upload success", data);
        } catch (error) {
            console.log("Error", error);
            reply.code(500).send('{ "message":"File upload to S3 failed" }');
            return;
        }

        // create an object to insert into the database
        const newFile = JSON.parse('{ "type":"' + fileType + '", "name":"' + fileName + '", "description":"' + fileDescription + '" }');

        // insert the new file into the database
        try {
            const inserted = fileController.newFile(newFile);
            console.log("Insert success", inserted);
            reply.code(200).send('{ "message":"File upload was successful" }');
            return;
        } catch (error) {
            console.log("Error", error);
            reply.code(500).send('{ "message":"File uploaded to S3 but database insert failed" }');
            return;
        }
    } catch (error) {
        console.log(error);
        reply.code(500).send('{ "message":"Upload to S3 failed" }');
        return;
    }
})

// get a file type from the database
// requires an id
app.get('/getFileType', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8')

    // in production you would probably want to limit the
    // the info to the bare miminum required by front-end.
    // as in, the bucket info, paths, and sanity checking 
    // data would be better left undisclosed
    // but this is POC so we yolo! ¯\_(ツ)_/¯

    // sanity checking
    if(!request.query.id) {
        reply.code(400).send('{ "message":"Please provide a file type id" }');
        return;   
    } 

    try {
        const fileType = await fileTypeController.getFileType(request.query.id);
        
        if(!fileType) {
            reply.code(404).send('{ "message":"File type does not exist" }');
            return;
        }
        reply.code(200).send('{ "data": ' + JSON.stringify(fileType) + '  }')
        return
    } catch (error) {
        console.log("Error", error);
        reply.code(500).send('{ "message":"Cannot access file type" }');
        return;
    } 
})

// get all the file types in the database
app.get('/getFileTypes', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8');

    // in production you would probably want to limit the
    // the info to the bare miminum required by front-end.
    // as in, the bucket info, paths, and sanity checking 
    // data would be better left undisclosed
    // but this is POC so we yolo! ¯\_(ツ)_/¯

    try {
        const fileTypes = await fileTypeController.getFileTypes();

        let data = [];

        for(let i = 0; i < fileTypes.length; i++) {
            const fileType = fileTypes[i].type;
            delete fileTypes[i]['_id'];

            data.push(fileTypes[i]);
        }
        reply.code(200).send('{ "data": ' + JSON.stringify(data) + '  }')
        return ;
    } catch (error) {
        console.log("Error", error);
        reply.code(500).send('{ "message":"Cannot access file types" }');
        return;
    } 
})

// create a new file type document/row in the database
// requires a file type, text, help, mimetypes, extensions, bucket, and path
app.post('/newFileType', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8');

    // sanity checking
    if(!request.body.type) {
        reply.code(400).send('{ "message":"Please provide file type" }');
        return;   
    } else if(!request.body.text) {
        reply.code(400).send('{ "message":"Please provide file text" }');
        return;  
    } else if(!request.body.help) {
        reply.code(400).send('{ "message":"Please provide file help" }');
        return; 
    } else if(!request.body.mimetypes) {
        reply.code(400).send('{ "message":"Please provide mimetypes" }');
        return; 
    } else if(!request.body.extensions) {
        reply.code(400).send('{ "message":"Please provide extensions" }');
        return; 
    } else if(!request.body.bucket) {
        reply.code(400).send('{ "message":"Please provide bucket" }');
        return; 
    } else if(!request.body.path) {
        reply.code(400).send('{ "message":"Please provide bucket path" }');
        return; 
    }

    try {
        const inserted = await fileTypeController.newFileType(request.body);
        reply.code(201).send('{ "data":"Successfully created file type"}');
        console.log(inserted);
    } catch (error) {
        console.log("Error", error);
        reply.code(500).send('{ "message":"Cannot create file type" }');
        return
    } 
})

// update file type document/row in the database
// requires an id, file type, text, help, mimetypes, extensions, bucket, and path
app.put('/updateFileType', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8');

    // grab the id parameter
    const fileId = request.body.id;

    // sanity checking
    if(!request.body.id) {
        reply.code(400).send('{ "message":"Please provide file id" }');
        return;          
    } else if(!request.body.type) {
        reply.code(400).send('{ "message":"Please provide file type" }');
        return;   
    } else if(!request.body.text) {
        reply.code(400).send('{ "message":"Please provide file text" }');
        return;  
    } else if(!request.body.help) {
        reply.code(400).send('{ "message":"Please provide file help" }');
        return; 
    } else if(!request.body.mimetypes) {
        reply.code(400).send('{ "message":"Please provide mimetypes" }');
        return; 
    } else if(!request.body.extensions) {
        reply.code(400).send('{ "message":"Please provide extensions" }');
        return; 
    } else if(!request.body.bucket) {
        reply.code(400).send('{ "message":"Please provide bucket" }');
        return; 
    } else if(!request.body.path) {
        reply.code(400).send('{ "message":"Please provide bucket path" }');
        return; 
    }

    // do we have a row to update?
    try {
        const fileType = await fileTypeController.getFileType(request.body.id);

        if(!fileType) {
            reply.code(404).send('{ "message":"File type does not exist" }');
            return;
        }
    } catch (error) {
        console.log("Error", error);
        reply.code(404).send('{ "message":"Cannot access file type" }');
        return;
    }

    try {
        // rename the id key to _id
        renameKey(request.body, "id", "_id");

        const updated = await fileTypeController.updateFileType(fileId, request.body);
        console.log(updated);
        reply.code(201).send('{ "message":"Successfully updated file type" }');
        return;
    } catch (error) {
        console.log("Error", error);
        reply.code(500).send('{ "message":"Cannot update file type" }');
        return;
    } 
})

// get a presigned URL from the S3 service
// requires an id
app.get('/getUrl', async function (request, reply) {
    // always return JSON
    reply.header('Content-Type', 'application/json; charset=utf-8');

    const fileId = request.query.id;

    if(!fileId) {
        reply.code(400).send('{ "message":"Please provide a file Id" }');
        return;
    } 

    try {
        const file = await fileController.getFile(fileId);

        if(!file) {
            reply.code(404).send('{ "message":"File does not exist" }');
            return;
        }

        // need these for later
        const fileType = file.type;
        const fileName = file.name;
    
        // grab the file type info
        const fileTypes = await fileTypeController.getFileTypes();
    
        // grab our type info
        const typeInfo = getTypeInfo(fileType, fileTypes);
    
        // Set the parameters
        const params = {
            "Bucket": typeInfo.bucket,
            "Key": typeInfo.path + "/" + fileName
        }

        // check if the S3 object even exists
        try { 
            const headCheck = await s3.send(new HeadObjectCommand(params))
        } catch (error) {
            //if(error.message == 'NotFound') {
            if(error.$metadata.httpStatusCode == 404) {
                reply.code(404).send('{ "message":"Object does not exist" }');
            } else {
                console.log("Error", error);
                reply.code(500).send('{ "message":"Problem determining object status" }');
            }
            return  ;
        }
    
        // call S3 to create presigned url
        try {
            const url  = await getSignedUrl(s3, new GetObjectCommand(params), { expiresIn: 5 * 60 })
            console.log("Success", url);
            reply.code(200).send('{ "url":"' + url + '" }');
            return
        } catch (error) {
            console.log("Error", error);
            reply.code(500).send('{ "message":"Cannot create url" }');
            return
        } 
    } catch (error) {
        console.log("Error", error);
        reply.code(400).send('{ "message":"Problem accessing file" }');
        return;
    }
})

// build the origin list first
originController.getOrigins().then(function(origins) {
    let originList = [];
    for(i = 0; i < origins.length; i++) {
        originList.push(origins[i].origin);
    }

    // handle CORS configuration
    app.register(require('fastify-cors'), {
        origin: originList,
        methods: [ 'GET', 'PUT', 'POST', 'DELETE' ],
        allowerdHeaders: [ 'Content-Type', 'Origin', 'Accept' ],
        credentials: true
    })

    // Start the server
    app.listen(80, '0.0.0.0', function (error, address) {
        if (error) {
            console.error(error);
            process.exit(1);
        }
        console.log(`Server listening on ${address}`);
    })

}).catch(function(error) {
    console.log("Error", error);
})
