/*jshint esversion: 9*/
/* eslint-env es6 */
var extractor = require("./extract.js");
var proofReader = require("./proof-read.js");
var myArgs = process.argv.slice(2);
const fs = require('fs');
//for CLI formatting
const chalk = require('chalk');
const error = chalk.bold.red;
const warning = chalk.keyword('orange');

function main() {
    /*1. Parse arguments */
    var contractName = "", functionName = "";
    if (myArgs.length < 1) {
        console.log(error('Need contract name') + warning(' e.g. node CodeParser.js myContract myFunction'));
        return;
    } else if (myArgs.length == 1){
        contractName = myArgs[0];
        functionName = "";
    } else if (myArgs.length == 2) {
        contractName = myArgs[0];
        functionName = myArgs[1];
    }

    /*2. Check if the contract build JSON exists in the Truffle project*/
    if(!fs.existsSync('../build/contracts/' + contractName + '.json')){
        console.log("The given contract name " + contractName + " is not found within build/contracts!");
        console.log("Please make sure to compile your contracts via Truffle and that its build JSON file exists in build/contracts of your Truffle project.");
        return;
    }

    /*3. Use extractor module*/
    contractAST = extractor.extraction(contractName, functionName);

    /*4. Use proof-reader module*/
    proofReader.proofRead(contractAST);
}

try {
    main();
} catch (err) {
    console.log(err);
}
