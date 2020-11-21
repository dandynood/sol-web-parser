/*jshint esversion: 9*/
/* eslint-env es6 */
var express = require('express');
var app = express();
var fs = require("fs");
var multer = require('multer');
var bodyParser = require('body-parser');
var path = require('path');
const srcDir = __dirname + "/src/";
const contractDir = './build/contracts/';
const exec = require('child_process').exec;

//Get code parser
var codeParser = require('./CodeParser/CodeParser');
const e = require('express');
function callCodeParser(contractName) {
    try {
        return codeParser.main(contractName);
    } catch (err) {
        console.log(err);
    }
}
// Create application/x-www-form-urlencoded parser and json parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//Used to serve static files such as CSS or JS from the src folder
app.use(express.static('src'));

//If GET URL is "/", load the index
app.get('/', function (req, res) {
    //have the response object send a message back on request
    console.log("Got a GET request for the homepage");
    res.sendFile(srcDir + "index.html");
});

/*For File uploads*/
//Filtering out for only .sol files
var soldityFilter = function (req, file, cb) {
    // Accept solidity files only
    if (!file.originalname.match(/\.sol$/)) {
        req.fileValidationError = 'Please upload a Solidity file (.sol)';
        return cb(new Error('Please upload a Solidity file (.sol)'), false);
    }
    cb(null, true);
};
//create a middleware of multer where the destinatin is uploads, and it will contain a single file with the same field name as the form's file input type
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'contracts/');
    },
    //By default, multer removes file names and extensions so let's add them back
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

//since it's a single upload, use req.file. Some validation to only allow uploading .sol files
app.post('/file_upload', function (req, res) {
    let upload = multer({
        storage: storage,
        fileFilter: soldityFilter
    }).single('solFileInput'); //name of the file input
    //1. Check and validate the sol file
    upload(req, res, function (err) {
        // req.file contains information of uploaded file
        // req.body contains information of text fields, if there were any
        if (req.fileValidationError) {
            return res.status(500).send({
                message: req.fileValidationError
            });
        } else if (!req.file) {
            return res.status(500).send({
                message: 'No file uploaded. Please select an Solidity (.sol) file to upload'
            });
        } else if (err instanceof multer.MulterError) {
            return res.send(err);
        } else if (err) {
            return res.send(err);
        }

        //if successful, read the file and send the formatted text back to the index
        //Compile the contracts as well via the "truffle compile" command lind 
        fs.readFile(req.file.path, function (err, data) {
            if (err) {
                return res.send(err);
            } else {
                let response = {
                    message: "File uploaded",
                    filename: req.file.originalname,
                    compileResults: {
                        message: "",
                        success: false
                    }
                };
                //2. Compile contracts via Truffle
                exec('truffle compile', (error, stdout, stderr) => {
                    console.log(`exec stdout: ${stdout}`);
                    response.compileResults.message = stdout.toString();
                    if (error || stderr) {
                        if(error) {
                            console.error(`exec error: ${error}`);
                            response.compileResults.message =+ error.toString();
                        }
                        if(stderr) {
                            console.error(`exec stdrror: ${stderr}`);
                            response.compileResults.message =+ stderr.toString();
                        }
                        response.compileResults.success = false;
                        response.message += " but compilation failed";
                        res.send(response);
                    } else {
                        response.compileResults.success = true;
                        response.message += " and compiled successfully";
                        //3. Send the "upload successful" response back
                        res.send(response);
                    }
                });
            }
        });
    });
});

/*Other requests*/
//Called when the user tests a compiled contract that was selected in the frontend. Return the code parser's results
app.post('/select_test', function(req, res) {
    //1. Hand control over to the code parser
    let results = {};
    console.log("Obtained contract:", req.body.contractName);
    results = callCodeParser(req.body.contractName);
    //2. aggregate the results to highlight detections throughout all functions 
    let finalResults = {
        contract: results,
        message: 'Code Parser testing completed'
    };
    console.log("Code Parser testing completed on ", req.body.contractName);
    //3. Package the results and send it back to the app
    res.send(finalResults);
});

//get all compiled contract names under ./build/contracts to allow specific contracts to test
app.get('/get_contracts', function (req, res) {
    if (!fs.existsSync(contractDir)){
        console.log("No directory!",contractDir);
        return res.status(500).send({
            message: 'No directory ./build/contracts found'
        });
    }
    //get names, filtering only for JSON types and removing their extensions for the Vue
    let contractNames = fs.readdirSync(contractDir, {withFileTypes: true})
    .filter(file => path.extname(file.name).toLowerCase() === ".json")
    .map(file => path.parse(file.name).name);

    res.send(contractNames);
});

//Used to compile all contracts when needed
app.get('/compile_contracts', function (req, res) {
    //1. Compile contracts via Truffle
    console.log("Compiling..");    
    let response = {
        message: "",
        compileResults: {
            message: "",
            success: false
        },
        contractNames: []
    };
    exec('truffle compile', (error, stdout, stderr) => {
        console.log(`exec stdout: ${stdout}`);
        response.compileResults.message = stdout.toString();
        if(error || stderr){
            if (error) {
                console.error(`exec error: ${error}`);
                response.compileResults.message =+ error.toString();
            }
            if(stderr) {
                console.error(`exec stderr: ${stderr}`);
                response.compileResults.message =+ stderr.toString();
            }
            response.compileResults.success = false;
            response.message = "Compilation failed";
            res.send(response);
        } else {
            response.compileResults.success = true;
            //2. get contract names
            if (!fs.existsSync(contractDir)){
                console.log("No directory!",contractDir);
                return res.status(500).send({
                    message: 'No directory ./build/contracts found'
                });
            }
            //get names, filtering only for JSON types and removing their extensions for the Vue
            let contractNames = fs.readdirSync(contractDir, {withFileTypes: true})
            .filter(file => path.extname(file.name).toLowerCase() === ".json")
            .map(file => path.parse(file.name).name);
        
            response.contractNames = contractNames;
            response.message = "Compilation completed";
            console.log("Compilation completed"); 
            res.send(response);
        }
    });
});

//Called when the user wants to test all compiled contracts. This will be an SSE stream to stream its progress
//Once all the list of contracts are exhausted, it will return the final result in one array bulk to the frontend
app.post('/test_all_contracts', async function (req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
    });
    res.flushHeaders();
    let contracts = req.body.contractsToTest;
    let max = req.body.contractsToTest.length;
    let results = [];
    let i = 0;
    // If connection closes, stop sending events
    req.socket.on('close', () => {
        console.log("Finished batch test: "+max+" compiled contracts tested.");
        return res.end();
    });   

    for(; i < max; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        console.log('Testing', contracts[i]);
        //Stream the progress of testing to the frontend. Status event is purely for marking what is currently being tested
        res.write(`event: status\ndata: ${i+1}. Testing ${contracts[i]}\n\n`);
        results.push(callCodeParser(contracts[i]));
    }

    //Once finish, aggregate the results, send the final results and end the stream
    if(i === max) {
        let finalResults = this.aggregateTotals(results);
        res.write(`event: gotTestResults\ndata:${JSON.stringify(finalResults)}\n\n`);
        return res.end();
    }
});
//Aggregates the results from test_all_contracts. Expect positive/negative detection counts
aggregateTotals = function(results) {
    let finalResults = {
        contracts: results,
        numOfContracts: results.length, 
        positives: {
          unsecuredCalls:0, mishandledErrors:0, overDependency:0, dangerousDelegates:0
        }, 
        negatives: {
          unsecuredCalls:0, mishandledErrors:0, overDependency:0, dangerousDelegates:0
        }
    };

    for(let i=0;i<results.length;i++) {
        if(results[i].positives.unsecuredCalls > 0) { finalResults.positives.unsecuredCalls++; } else { finalResults.negatives.unsecuredCalls++; }
        if(results[i].positives.mishandledErrors > 0) { finalResults.positives.mishandledErrors++; } else { finalResults.negatives.mishandledErrors++; }
        if(results[i].positives.overDependency > 0) { finalResults.positives.overDependency++; } else { finalResults.negatives.overDependency++; }
        if(results[i].dangerousDelegates.score > 0) { finalResults.positives.dangerousDelegates++; } else { finalResults.negatives.dangerousDelegates++; }
    }

    return finalResults;
};

/*Set up the server to listen to 8081, and perform a function*/
var server = app.listen(8081, function () {
    var host = server.address().address; //no address specified so it goes to localhost/127.0.0.1
    var port = server.address().port; //assigned at 8081

    console.log("Example app listening at http://%s:%s", host, port);
});