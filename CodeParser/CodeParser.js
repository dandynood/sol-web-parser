/*jshint esversion: 9*/
/* eslint-env es6 */
const fs = require('fs');
//for CLI formatting
const chalk = require('chalk');
const error = chalk.bold.red;
const warning = chalk.keyword('orange');
const contractDir = './build/contracts/';

/*  Code Parser controller V1, Last updated: 29/12/2020
    Initial controller to load the extractor and proof-reader modules
    Returned test results to the browser interface, currently follows this structure:
    result = {
        name: "..."
        payable: bool
        fields: [{
            name : "...", value: "...", id: int, type: "..."
            }, ...
        ]
        functions: [{
            name: "...", visibility: "...", stateMutability: "...", modifiers: [], unsecuredCalls: [], mishandledErrors: [], overDependency: []
            }, ...
        ]
        dangerounsDelegates : {
            messages: [{type: "...", msg: "..."}, ...], score: int, scoreLimit: int, noOtherOpcodes: bool, delegateCallMsgData: []
        }
    } 
    For more info on the specific properties of unsecuredCalls, mishandledErrors, overDependency and dangerousDelegates test results, refer to the respective script in the /patterns/ folder
*/
module.exports = {
    main: function (contractName = "") {
        let extractorV2 = require("./extractV2.js");
        let proofReader = require("./proof-read.js");
        /*1. Parse arguments */
        if (contractName.length < 1) {
            console.log(error('Need contract name') + warning(' e.g. node CodeParser.js myContract myFunction'));
            return;
        }

        /*2. Check if the contract build JSON exists in the Truffle project*/
        if (!fs.existsSync(contractDir + contractName + '.json')) {
            console.log("The given contract name " + contractName + " is not found within build/contracts!");
            console.log("Please make sure to compile your contracts via Truffle and that its build JSON file exists in build/contracts of your Truffle project.");
            return;
        }

        /*3. Use extractor module*/
        let functionName = "";
        let contractAST = {};
        let result = {};
        contractAST = extractorV2.extraction(contractName, functionName);

        /*4. Use proof-reader module*/
        result = proofReader.proofRead(contractAST);
        //console.log("Withdraw:", result.functions[3]);
        return result;
    }
};
